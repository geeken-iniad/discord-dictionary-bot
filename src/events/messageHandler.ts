import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
} from "discord.js";
import { prisma } from "../prismaClient";
import {
  calculateContextScore,
  getPrimaryTitle,
  normalizeContextText,
} from "../utils/contextScoring";
import { isQuizChannelActive } from "../utils/quizState";

// ⏱️ タイマー用のメモ帳
const replyCooldowns = new Map<string, number>();
const COOLDOWN_TIME = 24 * 60 * 60 * 1000; // 24時間

// 正規化関数
function normalize(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase();
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTermCooldownKey(channelId: string, term: string): string {
  return `${channelId}_term_${normalize(term)}`;
}

function isCooldownActive(key: string, now: number): boolean {
  const lastReplyTime = replyCooldowns.get(key) || 0;
  return now - lastReplyTime < COOLDOWN_TIME;
}

function getWordCooldownKeys(
  channelId: string,
  word: { id: number; titles?: Array<{ text: string }> },
  matchedTitles: Set<string>,
): string[] {
  const keys = new Set<string>();

  (word.titles || []).forEach((title) => {
    if (!title.text.trim()) return;
    keys.add(getTermCooldownKey(channelId, title.text));
  });

  matchedTitles.forEach((title) => {
    if (!title.trim()) return;
    keys.add(getTermCooldownKey(channelId, title));
  });

  // データ不整合でタイトルが空でも、Word単位のクールダウンは必ず効かせる
  keys.add(`${channelId}_word_${word.id}`);

  return Array.from(keys);
}

// Wiki辞書から単語を検索する関数
async function findWikiMatches(
  normalizedContent: string,
  allWikiWords: { id: number; term: string; meaning: string; link: string }[],
): Promise<typeof allWikiWords> {
  const matches: typeof allWikiWords = [];

  for (const wikiWord of allWikiWords) {
    const targetWord = normalize(wikiWord.term);
    const escapedWord = escapeRegExp(targetWord);
    const regex = new RegExp(`(?<![a-z0-9_])${escapedWord}(?![a-z0-9_])`);

    if (regex.test(normalizedContent)) {
      matches.push(wikiWord);
    }
  }

  return matches;
}

function buildGuideButtons(
  items: Array<{ id: number; label: string; type: "word" | "wiki" }>,
) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let i = 0; i < items.length && i < 25; i += 5) {
    const chunk = items.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      chunk.map((item) =>
        new ButtonBuilder()
          .setCustomId(`dict_${item.type}_${item.id}`)
          .setLabel(item.label.substring(0, 80))
          .setStyle(ButtonStyle.Primary),
      ),
    );
    rows.push(row);
  }

  return rows;
}

export const handleMessage = async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (isQuizChannelActive(message.channelId)) return;

  try {
    if (message.channel.isThread()) {
      const escapedThread = await prisma.escapedThread.findUnique({
        where: {
          threadId: message.channelId,
        },
      });

      if (escapedThread) return;
    }

    // 1. URL除去 & 正規化
    const contentWithoutUrl = message.content.replace(/https?:\/\/[^\s]+/g, "");
    if (!contentWithoutUrl.trim()) return;
    const normalizedContent = normalize(contentWithoutUrl);

    // 👇 【追加】今いるサーバーのIDを取得！
    const guildId = message.guildId!;

    // 2. DBから単語取得
    // 👇 【修正】「このサーバーの単語のタイトル」だけを取得するように where を追加！
    const allTitles = await prisma.title.findMany({
      where: {
        word: {
          guildId: guildId, // 👈 これで他のサーバーの身内ネタに反応しなくなります！
        },
      },
      include: {
        word: {
          include: { titles: true },
        },
      },
    });

    // 3. マッチング
    const hitTitles = allTitles.filter((t) => {
      const targetWord = normalize(t.text);
      const escapedWord = escapeRegExp(targetWord);

      // (?<![a-z0-9_]) = 直前に英数字がない
      // (?![a-z0-9_])  = 直後に英数字がない
      const regex = new RegExp(`(?<![a-z0-9_])${escapedWord}(?![a-z0-9_])`);

      return regex.test(normalizedContent);
    });

    // 重複除去して「ヒットしたWord」の配列(hits)を作る
    const uniqueWords = new Map();
    hitTitles.forEach((t) => uniqueWords.set(t.wordId, t.word));
    let hits = Array.from(uniqueWords.values());
    const matchedTitlesByWordId = new Map<number, Set<string>>();
    hitTitles.forEach((t) => {
      const current = matchedTitlesByWordId.get(t.wordId) || new Set<string>();
      current.add(t.text);
      matchedTitlesByWordId.set(t.wordId, current);
    });

    // ==========================================
    // 👇 新しいストッパー（単語ごとの連投防止）
    // ==========================================
    const now = Date.now();
    const channelId = message.channelId;

    // ヒットした単語の中から、「まだ24時間経っていない単語」を除外する
    hits = hits.filter((word) => {
      const cooldownKeys = getWordCooldownKeys(
        channelId,
        word,
        matchedTitlesByWordId.get(word.id) || new Set<string>(),
      );

      // 同じWordに紐づくタイトルのいずれか、またはWord自体がクールダウン中なら除外
      return cooldownKeys.every((key: string) => !isCooldownActive(key, now));
    });

    const scoredHits = hits
      .map((word) => ({
        word,
        score: calculateContextScore(
          word,
          normalizeContextText(contentWithoutUrl),
        ),
        group: getPrimaryTitle(word),
      }))
      .sort((a, b) => b.score - a.score);

    const groupedHits = new Map<string, (typeof scoredHits)[number]>();
    scoredHits.forEach((item) => {
      const current = groupedHits.get(item.group);
      if (!current || item.score > current.score) {
        groupedHits.set(item.group, item);
      }
    });

    hits = Array.from(groupedHits.values())
      .sort((a, b) => b.score - a.score)
      .map((item) => item.word);

    // もし全部の単語がクールダウン中だったら、ここで優先度2へ！
    if (hits.length === 0) {
      // ============================================
      // 👇 優先度2: Wiki辞書を検索する
      // ============================================

      // Wiki辞書から全単語を取得
      const allWikiWords = await prisma.wikiWord.findMany();

      // Embed作成用に、Wiki辞書のマッチを見つける
      const wikiMatches = await findWikiMatches(
        normalizedContent,
        allWikiWords,
      );

      // Wiki辞書も24時間クールダウン対象にする
      const availableWikiMatches = wikiMatches.filter((wikiWord) => {
        const key = getTermCooldownKey(channelId, wikiWord.term);
        return !isCooldownActive(key, now);
      });

      if (availableWikiMatches.length === 0) {
        return; // カスタム＆Wiki辞書ともヒットなし
      }

      // Wiki辞書用のクールダウン管理（カスタム辞書と同じ仕組みを流用）
      const setCooldownsForWiki = () => {
        availableWikiMatches.forEach((wikiWord) => {
          const key = getTermCooldownKey(channelId, wikiWord.term);
          replyCooldowns.set(key, Date.now());
        });
        console.log(
          `⏱️ チャンネル(${channelId})でWiki辞書の ${availableWikiMatches.length}個を解説。これらは24時間休止します。`,
        );
      };

      const wikiGuideButtons = buildGuideButtons(
        availableWikiMatches.map((wikiWord) => ({
          id: wikiWord.id,
          label: wikiWord.term,
          type: "wiki" as const,
        })),
      );

      await message.reply({
        content:
          "📚 関連ワードを検知しました。**解説を見る**ボタンを押すと、押した人にだけ表示されます。",
        components: wikiGuideButtons,
        allowedMentions: { repliedUser: false, parse: [] },
      });

      setCooldownsForWiki();
      return;
    }
    // ==========================================

    // 👇 タイマーをセットする共通の関数
    const setCooldowns = () => {
      hits.forEach((word) => {
        const cooldownKeys = getWordCooldownKeys(
          channelId,
          word,
          matchedTitlesByWordId.get(word.id) || new Set<string>(),
        );
        cooldownKeys.forEach((key) => {
          replyCooldowns.set(key, Date.now());
        });
      });
      console.log(
        `⏱️ チャンネル(${channelId})で ${hits.length}個の単語を解説。これらは24時間休止します。`,
      );
    };

    const wordGuideButtons = buildGuideButtons(
      hits.map((word) => ({
        id: word.id,
        label: `${
          hitTitles.find((t) => t.wordId === word.id)?.text ||
          word.titles?.[0]?.text ||
          "詳細"
        }${word.contextLabel ? ` · ${word.contextLabel}` : ""}`,
        type: "word" as const,
      })),
    );

    await message.reply({
      content:
        "📚 関連ワードを検知しました。**解説を見る**ボタンを押すと、押した人にだけ表示されます。",
      components: wordGuideButtons,
      allowedMentions: { parse: [] },
    });

    setCooldowns(); // 送信成功後にタイマーセット！
  } catch (error) {
    console.error("AutoResponse Error:", error);
  }
};
