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
  isQuizGuildActive,
  markQuizChannelActive,
  markQuizGuildActive,
  unmarkQuizChannelActive,
  unmarkQuizGuildActive,
} from "../utils/quizState";

function normalizeForQuizMatch(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase()
    .trim();
}

export const data = new SlashCommandBuilder()
  .setName("wiki-quiz")
  .setDescription("Wikipedia辞書からクイズを出します");

export const wikiQuizCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  const guildId = interaction.guildId || "global";

  if (isQuizGuildActive(guildId)) {
    await interaction.reply({
      content:
        "⏳ このサーバーでは現在クイズ進行中です。終了まで待ってください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  markQuizGuildActive(guildId);

  let lockReleased = false;
  const releaseLock = () => {
    if (lockReleased) return;
    unmarkQuizGuildActive(guildId);
    lockReleased = true;
  };

  try {
    await interaction.deferReply();

    const count = await prisma.wikiWord.count();
    if (count === 0) {
      await interaction.editReply("❌ まだWikipedia辞書に単語がありません。");
      releaseLock();
      return;
    }

    const randomIndex = Math.floor(Math.random() * count);
    const [wikiWord] = await prisma.wikiWord.findMany({
      take: 1,
      skip: randomIndex,
    });

    if (!wikiWord) {
      await interaction.editReply("❌ 取得エラー。");
      releaseLock();
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Aqua)
      .setTitle("🌐 Wikiクイズ！この単語はなーんだ？")
      .setDescription(`**意味:**\n${wikiWord.meaning}`)
      .setFooter({ text: "15秒以内に単語をチャットで答えてね！" });

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

    const quizChannelId = channel.id;
    markQuizChannelActive(quizChannelId);

    const filter = (m: Message) => !m.author.bot;
    let solved = false;
    const normalizedAnswer = normalizeForQuizMatch(wikiWord.term);

    const collector = channel.createMessageCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", async (m: Message) => {
      if (solved) return;

      const answer = normalizeForQuizMatch(m.content);
      if (answer === normalizedAnswer) {
        solved = true;
        await m.reply(`🎉 **正解です！** (${wikiWord.term})`);
        await m.react("⭕");
        collector.stop("answered");
        return;
      }

      await m.react("❌").catch(() => undefined);
    });

    collector.on("end", async () => {
      if (!solved) {
        await interaction.followUp(
          `⏰ **時間切れ！** 正解は **「${wikiWord.term}」** でした。`,
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
