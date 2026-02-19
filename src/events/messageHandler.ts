import { ChannelType, Colors, EmbedBuilder, Message } from "discord.js";
import { prisma } from "../prismaClient";

// 正規化関数
function normalize(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase();
}

export const handleMessage = async (message: Message) => {
  // Bot自身の発言や、Botへのメンションなどは無視
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    // 1. URL除去 & 正規化
    const contentWithoutUrl = message.content.replace(/https?:\/\/[^\s]+/g, "");
    if (!contentWithoutUrl.trim()) return;
    const normalizedContent = normalize(contentWithoutUrl);

    // 2. DBから単語取得 (includeの階層を深くしてエラー回避)
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

    // 重複除去
    const uniqueWords = new Map();
    hitTitles.forEach((t) => uniqueWords.set(t.wordId, t.word));
    const hits = Array.from(uniqueWords.values());

    // 4. 解説Embedを作成
    const embeds = hits.map((word) => {
      const titleText =
        word.titles && word.titles.length > 0 ? word.titles[0].text : "詳細";

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`📚 解説: ${titleText}`)
        .setDescription(word.meaning)
        .setFooter({ text: "💡 連続での反応は制限されています" });

      if (word.imageUrl) embed.setImage(word.imageUrl);
      if (word.link) embed.setURL(word.link);
      if (word.tag)
        embed.addFields({ name: "🏷️ タグ", value: word.tag, inline: true });

      return embed;
    });

    // 5. 送信処理 (最強のサイレントモード)

    // ▼ 既にスレッドの中なら、返信(reply)して通知をOFFにする
    if (
      message.channel.type === ChannelType.PublicThread ||
      message.channel.type === ChannelType.PrivateThread
    ) {
      await message.reply({
        embeds: embeds,
        allowedMentions: {
          repliedUser: false, // 相手への通知OFF
          parse: [], // 本文中のメンションも全て無効化
        },
      });
      return;
    }

    // ▼ 通常チャンネルなら、スレッドを作ってそこに投稿する
    let thread = message.thread;

    // まだスレッドがなければ作る
    if (!thread) {
      try {
        if (!hitTitles[0]) return;

        // ⚠️ Discordの仕様上、ここの「スレッド作成通知」だけは相手に届いてしまいます
        thread = await message.startThread({
          name: `解説: ${hitTitles[0].text}`,
          autoArchiveDuration: 60,
          reason: "用語解説のため",
        });
      } catch (e) {
        console.error(e);
        // エラー時は普通に返信（ここも通知OFF）
        await message.reply({
          embeds: embeds,
          allowedMentions: { repliedUser: false, parse: [] },
        });
        return;
      }
    }

    // スレッドの中に書き込む
    // replyではなくsendを使うことで、さらに通知のリスクを下げる
    await thread.send({
      content: "用語が見つかりました！",
      embeds: embeds,
      allowedMentions: { parse: [] }, // 👈 最強の通知カット設定
    });
  } catch (error) {
    console.error("AutoResponse Error:", error);
  }
};
