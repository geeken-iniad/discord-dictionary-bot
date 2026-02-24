import { ChannelType, Colors, EmbedBuilder, Message } from "discord.js";
import { prisma } from "../prismaClient";

// ⏱️ タイマー用のメモ帳
const replyCooldowns = new Map<string, number>();
const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間

// 正規化関数
function normalize(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase();
}

export const handleMessage = async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // ⚠️ ここにあった事前ストッパーは削除しました！
  // （どの単語が言われたか調べる前には止められないため）

  try {
    // 1. URL除去 & 正規化
    const contentWithoutUrl = message.content.replace(/https?:\/\/[^\s]+/g, "");
    if (!contentWithoutUrl.trim()) return;
    const normalizedContent = normalize(contentWithoutUrl);

    // 2. DBから単語取得
    const allTitles = await prisma.title.findMany({
      include: {
        word: {
          include: { titles: true },
        },
      },
    });

    // 3. マッチング
    const hitTitles = allTitles.filter((t) => {
      return normalizedContent.includes(normalize(t.text));
    });

    if (hitTitles.length === 0) return;

    // 重複除去して「ヒットしたWord」の配列(hits)を作る
    const uniqueWords = new Map();
    hitTitles.forEach((t) => uniqueWords.set(t.wordId, t.word));
    let hits = Array.from(uniqueWords.values());

    // ==========================================
    // 👇 新しいストッパー（単語ごとの連投防止）
    // ==========================================
    const now = Date.now();
    const channelId = message.channelId;

    // ヒットした単語の中から、「まだ1時間経っていない単語」を除外する
    hits = hits.filter((word) => {
      const key = `${channelId}_${word.id}`; // カギを「チャンネルID_単語ID」にする
      const lastReplyTime = replyCooldowns.get(key) || 0;
      return now - lastReplyTime >= COOLDOWN_TIME; // 1時間経っているものだけ残す
    });

    // もし全部の単語がクールダウン中だったら、ここで処理終了！
    if (hits.length === 0) return;
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
      console.log(`⏱️ チャンネル(${channelId})で ${hits.length}個の単語を解説。これらは1時間休止します。`);
    };

    // 5. 送信処理

    // ▼ 既にスレッドの中なら、返信(reply)
    if (
      message.channel.type === ChannelType.PublicThread ||
      message.channel.type === ChannelType.PrivateThread
    ) {
      await message.reply({
        embeds: embeds,
        allowedMentions: { repliedUser: false, parse: [] },
      });
      
      setCooldowns(); // 送信成功後にタイマーセット！
      return;
    }

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