import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  Message,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";
import {
  markQuizChannelActive,
  unmarkQuizChannelActive,
} from "../utils/quizState";

const activeQuizGuilds = new Set<string>();

// messageHandler と同じ正規化ロジックを使用
function normalizeForQuizMatch(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase()
    .trim();
}

export const data = new SlashCommandBuilder()
  .setName("quiz")
  .setDescription("登録された単語からクイズを出します");

export const quizCommand = async (interaction: ChatInputCommandInteraction) => {
  const guildId = interaction.guildId || "global";

  if (activeQuizGuilds.has(guildId)) {
    await interaction.reply({
      content:
        "⏳ このサーバーでは現在クイズ進行中です。終了まで待ってください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  activeQuizGuilds.add(guildId);

  let lockReleased = false;
  const releaseLock = () => {
    if (lockReleased) return;
    activeQuizGuilds.delete(guildId);
    lockReleased = true;
  };

  try {
    await interaction.deferReply();

    const count = await prisma.word.count({
      where: { guildId },
    });
    if (count === 0) {
      await interaction.editReply("❌ まだ単語が登録されていません。");
      releaseLock();
      return;
    }

    const randomIndex = Math.floor(Math.random() * count);
    const [word] = await prisma.word.findMany({
      where: { guildId },
      take: 1,
      skip: randomIndex,
      include: { titles: true },
    });

    if (!word) {
      await interaction.editReply("❌ 取得エラー。");
      releaseLock();
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🧠 クイズ！この意味はなーんだ？")
      .setDescription(`**意味:**\n${word.meaning}`)
      .setFooter({ text: "15秒以内に単語をチャットで答えてね！" });

    if (word.imageUrl) embed.setImage(word.imageUrl);

    await interaction.editReply({ embeds: [embed] });
    const quizMessage = await interaction.fetchReply();

    const channel = quizMessage.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply("❌ チャンネル情報を取得できません。");
      releaseLock();
      return;
    }

    if (!("createMessageCollector" in channel)) {
      await interaction.editReply("❌ このチャンネルではクイズを実行できません。");
      releaseLock();
      return;
    }

    // クイズ中はこのチャンネルの自動応答を一時停止する
    const quizChannelId = channel.id;
    markQuizChannelActive(quizChannelId);

    const filter = (m: Message) => !m.author.bot;
    let solved = false;
    const normalizedTitles = new Set(
      word.titles.map((t) => normalizeForQuizMatch(t.text)),
    );

    const collector = channel.createMessageCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", async (m: Message) => {
      if (solved) return;

      const normalizedAnswer = normalizeForQuizMatch(m.content);
      const isCorrect = normalizedTitles.has(normalizedAnswer);
      const titleText = word.titles.map((t) => t.text).join(" / ");

      if (isCorrect) {
        solved = true;
        await m.reply(`🎉 **正解です！** (${titleText})`);
        await m.react("⭕");
        collector.stop("answered");
        return;
      }

      await m.react("❌").catch(() => undefined);
    });

    collector.on("end", async () => {
      if (!solved) {
        const titleText = word.titles.map((t) => t.text).join(" / ");
        interaction.followUp(
          `⏰ **時間切れ！** 正解は **「${titleText}」** でした。`,
        );
      }

      unmarkQuizChannelActive(quizChannelId);

      releaseLock();
    });
  } catch (error) {
    console.error(error);
    if (interaction.channelId) {
      unmarkQuizChannelActive(interaction.channelId);
    }
    releaseLock();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply("❌ エラーが発生しました。");
      return;
    }

    await interaction.reply({
      content: "❌ エラーが発生しました。",
      flags: MessageFlags.Ephemeral,
    });
  }
};
