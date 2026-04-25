import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

function parseDateTimeInput(input: string, now: Date): Date | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );

  if (!match) return null;

  const yearInput = match[1] ? Number(match[1]) : null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

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

  const year = yearInput ?? now.getFullYear();
  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute
  ) {
    return null;
  }

  if (yearInput === null && candidate.getTime() < now.getTime()) {
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
  .setName("add-calender")
  .setDescription("カレンダー予定を登録します")
  .addStringOption((option) =>
    option
      .setName("datetime")
      .setDescription("日時 (形式: YYYY/MM/DD HH:mm または MM/DD HH:mm)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("event").setDescription("イベント名").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("location").setDescription("場所 (任意)").setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("details")
      .setDescription("イベント詳細 (任意)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("関連URL (任意、http/https のみ)")
      .setRequired(false),
  );

export const addCalenderCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  const isValidHttpUrl = (input: string): boolean => {
    try {
      const parsed = new URL(input);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId || "global";
    const datetimeInput = interaction.options.getString("datetime", true);
    const eventName = interaction.options.getString("event", true).trim();
    const location =
      interaction.options.getString("location", false)?.trim() || null;
    const eventDetails =
      interaction.options.getString("details", false)?.trim() || null;
    const eventUrl =
      interaction.options.getString("url", false)?.trim() || null;

    if (!eventName) {
      await interaction.editReply("❌ イベント名を入力してください。");
      return;
    }

    if (eventUrl && !isValidHttpUrl(eventUrl)) {
      await interaction.editReply("❌ URL は http/https のみ入力できます。");
      return;
    }

    const now = new Date();
    const eventAt = parseDateTimeInput(datetimeInput, now);

    if (!eventAt) {
      await interaction.editReply(
        "❌ 日時の形式が正しくありません。`YYYY/MM/DD HH:mm` または `MM/DD HH:mm` で入力してください。\n例: `2026/04/30 19:30` / `04/30 19:30`",
      );
      return;
    }

    await prisma.calendarEvent.create({
      data: {
        guildId,
        eventName,
        eventAt,
        location,
        eventDetails,
        eventUrl,
        authorName: interaction.user.username,
      },
    });

    const locationDisplay = location ? `\n**場所:** ${location}` : "";
    const detailsDisplay = eventDetails ? `\n**詳細:** ${eventDetails}` : "";
    const urlDisplay = eventUrl ? `\n**URL:** ${eventUrl}` : "";
    await interaction.editReply(
      `✅ 予定を登録しました。\n**日時:** ${formatEventDate(eventAt)}\n**イベント:** ${eventName}${locationDisplay}${detailsDisplay}${urlDisplay}`,
    );
  } catch (error) {
    console.error("Add Calender Error:", error);
    await interaction.editReply("❌ 予定の登録中にエラーが発生しました。");
  }
};
