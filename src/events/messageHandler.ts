import { Colors, EmbedBuilder, Message } from "discord.js";
import { prisma } from "../prismaClient";

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
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wiki辞書から単語を検索する関数
async function findWikiMatches(
  normalizedContent: string,
  allWikiWords: { term: string; meaning: string; link: string }[],
): Promise<typeof allWikiWords> {
  const matches: typeof allWikiWords = [];

  for (const wikiWord of allWikiWords) {
    const targetWord = normalize(wikiWord.term);
    const escapedWord = escapeRegExp(targetWord);
    const regex = new RegExp(
      `(?<![a-z0-9_])${escapedWord}(?![a-z0-9_])`,
    );

    if (regex.test(normalizedContent)) {
      matches.push(wikiWord);
    }
  }

  return matches;
}

export const handleMessage = async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

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

    // ==========================================
    // 👇 新しいストッパー（単語ごとの連投防止）
    // ==========================================
    const now = Date.now();
    const channelId = message.channelId;

    // ヒットした単語の中から、「まだ24時間経っていない単語」を除外する
    hits = hits.filter((word) => {
      const key = `${channelId}_${word.id}`; // カギを「チャンネルID_単語ID」にする
      const lastReplyTime = replyCooldowns.get(key) || 0;
      return now - lastReplyTime >= COOLDOWN_TIME; // 24時間経っているものだけ残す
    });

    // もし全部の単語がクールダウン中だったら、ここで優先度2へ！
    if (hits.length === 0) {
      // ============================================
      // 👇 優先度2: Wiki辞書を検索する
      // ============================================

      // Wiki辞書から全単語を取得
      const allWikiWords = await prisma.wikiWord.findMany();

      // Embed作成用に、Wiki辞書のマッチを見つける
      const wikiMatches = await findWikiMatches(normalizedContent, allWikiWords);

      if (wikiMatches.length === 0) {
        return; // カスタム＆Wiki辞書ともヒットなし
      }

      // Wiki辞書がヒットした場合のEmbed作成
      const wikiEmbeds = wikiMatches.map((wikiWord) => {
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle(`📚 説明: ${wikiWord.term}`)
          .setDescription(wikiWord.meaning)
          .setFooter({ text: "📚 Wikipediaより引用 (自動補完)" })
          .setURL(wikiWord.link);

        return embed;
      });

      // Wiki辞書用のクールダウン管理（カスタム辞書と同じ仕組みを流用）
      const setCooldownsForWiki = () => {
        wikiMatches.forEach((wikiWord) => {
          const key = `${channelId}_wiki_${wikiWord.term}`;
          replyCooldowns.set(key, Date.now());
        });
        console.log(
          `⏱️ チャンネル(${channelId})でWiki辞書の ${wikiMatches.length}個を解説。これらは24時間休止します。`,
        );
      };

      // Wiki辞書メッセージ送信
      let wikiThread = message.thread;
      if (!wikiThread) {
        try {
          wikiThread = await message.startThread({
            name: `解説: ${wikiMatches[0]?.term || "用語"}（Wiki）`,
            autoArchiveDuration: 60,
            reason: "Wikipedia用語解説のため",
          });
        } catch (e) {
          console.error(e);
          await message.reply({
            embeds: wikiEmbeds,
            allowedMentions: { repliedUser: false, parse: [] },
          });

          setCooldownsForWiki();
          return;
        }
      }

      await wikiThread.send({
        content: "用語が見つかりました！(Wikipedia)",
        embeds: wikiEmbeds,
        allowedMentions: { parse: [] },
      });

      setCooldownsForWiki();
      return;
    }
    // ==========================================

    // 4. 解説Embedを作成 (生き残った単語だけで作る)
    const embeds = hits.map((word) => {
      const titleText =
        word.titles && word.titles.length > 0 ? word.titles[0].text : "詳細";

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`📚 解説: ${titleText}`)
        .setDescription(word.meaning)
        .setFooter({ text: "💡 同じ単語の連続反応は制限されています" });

      if (word.imageUrl) embed.setImage(word.imageUrl);
      if (word.link) embed.setURL(word.link);
      if (word.tag)
        embed.addFields({ name: "🏷️ タグ", value: word.tag, inline: true });

      return embed;
    });

    // 👇 タイマーをセットする共通の関数
    const setCooldowns = () => {
      hits.forEach((word) => {
        const key = `${channelId}_${word.id}`;
        replyCooldowns.set(key, Date.now());
      });
      console.log(`⏱️ チャンネル(${channelId})で ${hits.length}個の単語を解説。これらは24時間休止します。`);
    };

    // 5. 送信処理

    // ▼ 通常チャンネルなら、スレッドを作ってそこに投稿する
    let thread = message.thread;
    if (!thread) {
      try {
        thread = await message.startThread({
          // ※ヒットした単語のうち、最初の単語の名前をスレッド名にする
          name: `解説: ${hitTitles.find(t => t.wordId === hits[0].id)?.text || "用語"}`,
          autoArchiveDuration: 60,
          reason: "用語解説のため",
        });
      } catch (e) {
        console.error(e);
        await message.reply({
          embeds: embeds,
          allowedMentions: { repliedUser: false, parse: [] },
        });
        
        setCooldowns();
        return;
      }
    }

    // スレッドの中に書き込む
    await thread.send({
      content: "用語が見つかりました！",
      embeds: embeds,
      allowedMentions: { parse: [] },
    });

    setCooldowns(); // 送信成功後にタイマーセット！

  } catch (error) {
    console.error("AutoResponse Error:", error);
  }
};