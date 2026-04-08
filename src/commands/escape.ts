import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

export const data = new SlashCommandBuilder()
  .setName("escape")
  .setDescription("このスレッドでBotの自動反応を無効にします");

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

    await prisma.escapedThread.upsert({
      where: {
        threadId,
      },
      update: {
        guildId,
      },
      create: {
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