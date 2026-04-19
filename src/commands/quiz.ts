import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  Message,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { prisma } from "../prismaClient";

const activeQuizGuilds = new Set<string>();

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

    const filter = (m: Message) => !m.author.bot;
    const channel = interaction.channel as TextChannel;
    let solved = false;

    const collector = channel.createMessageCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", async (m: Message) => {
      if (solved) return;

      const isCorrect = word.titles.some((t) => t.text === m.content.trim());
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

    collector.on("end", (_collected) => {
      if (!solved) {
        const titleText = word.titles.map((t) => t.text).join(" / ");
        interaction.followUp(
          `⏰ **時間切れ！** 正解は **「${titleText}」** でした。`,
        );
      }

      releaseLock();
    });
  } catch (error) {
    console.error(error);
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
