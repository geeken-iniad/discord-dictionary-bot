import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

export const data = new SlashCommandBuilder()
  .setName("escape")
  .setDescription("このスレッドでBotの自動反応を切り替えます");

export const escapeCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    if (!interaction.channel?.isThread()) {
      await interaction.reply({
        content: "❌ このコマンドはスレッド内でのみ使えます。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId || "global";
    const threadId = interaction.channelId;

    const escapedThread = await prisma.escapedThread.findUnique({
      where: { threadId },
    });

    if (escapedThread) {
      await prisma.escapedThread.delete({
        where: { threadId },
      });

      await interaction.reply({
        content: "✅ このスレッドのBot自動反応を再度有効にしました。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.escapedThread.create({
      data: {
        guildId,
        threadId,
      },
    });

    await interaction.reply({
      content: "✅ このスレッドではBotの自動反応を無効にしました。",
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ エラーが発生しました。",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: "❌ エラーが発生しました。",
      flags: MessageFlags.Ephemeral,
    });
  }
};