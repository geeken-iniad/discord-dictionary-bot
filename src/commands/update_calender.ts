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

function isValidHttpUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const data = new SlashCommandBuilder()
  .setName("update-calender")
  .setDescription("登録されたカレンダー予定を更新します")
  .addStringOption((option) =>
    option
      .setName("datetime")
      .setDescription(
        "更新対象の日時 (形式: YYYY/MM/DD HH:mm または MM/DD HH:mm)",
      )
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("event")
      .setDescription("更新対象のイベント名")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("new_datetime")
      .setDescription("更新後の日時 (省略で変更なし)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("new_event")
      .setDescription("更新後のイベント名 (省略で変更なし)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("location")
      .setDescription("場所 (任意、空欄で変更なし)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("details")
      .setDescription("イベント詳細 (任意、空欄で変更なし)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("関連URL (任意、http/https のみ)")
      .setRequired(false),
  );

export const updateCalenderCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId || "global";
    const datetimeInput = interaction.options.getString("datetime", true);
    const eventName = interaction.options.getString("event", true).trim();
    const newDatetimeInput = interaction.options.getString(
      "new_datetime",
      false,
    );
    const newEventName = interaction.options
      .getString("new_event", false)
      ?.trim();
    const location = interaction.options.getString("location", false)?.trim();
    const eventDetails = interaction.options
      .getString("details", false)
      ?.trim();
    const eventUrl = interaction.options.getString("url", false)?.trim();

    if (eventUrl && !isValidHttpUrl(eventUrl)) {
      await interaction.editReply("❌ URL は http/https のみ入力できます。");
      return;
    }

    const targetAt = parseDateTimeInput(datetimeInput, new Date());
    if (!targetAt) {
      await interaction.editReply(
        "❌ 対象日時の形式が正しくありません。`YYYY/MM/DD HH:mm` または `MM/DD HH:mm` で入力してください。",
      );
      return;
    }

    const updateData: {
      eventName?: string;
      eventAt?: Date;
      location?: string | null;
      eventDetails?: string | null;
      eventUrl?: string | null;
    } = {};

    if (newDatetimeInput) {
      const parsedNewDatetime = parseDateTimeInput(
        newDatetimeInput,
        new Date(),
      );
      if (!parsedNewDatetime) {
        await interaction.editReply(
          "❌ 更新後の日時の形式が正しくありません。`YYYY/MM/DD HH:mm` または `MM/DD HH:mm` で入力してください。",
        );
        return;
      }
      updateData.eventAt = parsedNewDatetime;
    }

    if (newEventName) updateData.eventName = newEventName;
    if (location !== undefined) updateData.location = location || null;
    if (eventDetails !== undefined)
      updateData.eventDetails = eventDetails || null;
    if (eventUrl !== undefined) updateData.eventUrl = eventUrl || null;

    if (Object.keys(updateData).length === 0) {
      await interaction.editReply("❌ 更新する内容を1つ以上指定してください。");
      return;
    }

    const result = await prisma.calendarEvent.updateMany({
      where: {
        guildId,
        eventName,
        eventAt: targetAt,
      },
      data: updateData,
    });

    if (result.count === 0) {
      await interaction.editReply(
        "❌ 条件に一致する予定が見つかりませんでした。",
      );
      return;
    }

    const updatedDate = updateData.eventAt || targetAt;
    const updatedEventName = updateData.eventName || eventName;
    const locationDisplay =
      location !== undefined ? `\n**場所:** ${location || "なし"}` : "";
    const detailsDisplay =
      eventDetails !== undefined ? `\n**詳細:** ${eventDetails || "なし"}` : "";
    const urlDisplay =
      eventUrl !== undefined ? `\n**URL:** ${eventUrl || "なし"}` : "";

    await interaction.editReply(
      `✅ 予定を更新しました。\n**日時:** ${formatEventDate(updatedDate)}\n**イベント:** ${updatedEventName}${locationDisplay}${detailsDisplay}${urlDisplay}`,
    );
  } catch (error) {
    console.error("Update Calender Error:", error);
    await interaction.editReply("❌ 予定の更新中にエラーが発生しました。");
  }
};
