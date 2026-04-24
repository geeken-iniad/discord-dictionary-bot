import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

function parseDateTimeInput(input: string, now: Date): Date | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const year = now.getFullYear();
  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute
  ) {
    return null;
  }

  if (candidate.getTime() < now.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }

  return candidate;
}

function formatEventDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export const data = new SlashCommandBuilder()
  .setName("add_calender")
  .setDescription("カレンダー予定を登録します")
  .addStringOption((option) =>
    option
      .setName("datetime")
      .setDescription("月日時 (形式: MM/DD HH:mm)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("event").setDescription("イベント名").setRequired(true),
  );

export const addCalenderCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId || "global";
    const datetimeInput = interaction.options.getString("datetime", true);
    const eventName = interaction.options.getString("event", true).trim();

    if (!eventName) {
      await interaction.editReply("❌ イベント名を入力してください。");
      return;
    }

    const now = new Date();
    const eventAt = parseDateTimeInput(datetimeInput, now);

    if (!eventAt) {
      await interaction.editReply(
        "❌ 月日時の形式が正しくありません。`MM/DD HH:mm` で入力してください。\n例: `04/30 19:30`",
      );
      return;
    }

    await prisma.calendarEvent.create({
      data: {
        guildId,
        eventName,
        eventAt,
        authorName: interaction.user.username,
      },
    });

    await interaction.editReply(
      `✅ 予定を登録しました。\n**日時:** ${formatEventDate(eventAt)}\n**イベント:** ${eventName}`,
    );
  } catch (error) {
    console.error("Add Calender Error:", error);
    await interaction.editReply("❌ 予定の登録中にエラーが発生しました。");
  }
};
