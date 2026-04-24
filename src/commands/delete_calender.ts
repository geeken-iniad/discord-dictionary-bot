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

export const data = new SlashCommandBuilder()
  .setName("delete_calender")
  .setDescription("登録されたカレンダー予定を削除します")
  .addStringOption((option) =>
    option
      .setName("datetime")
      .setDescription("日時 (形式: YYYY/MM/DD HH:mm または MM/DD HH:mm)")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("event").setDescription("イベント名").setRequired(true),
  );

export const deleteCalenderCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId || "global";
    const datetimeInput = interaction.options.getString("datetime", true);
    const eventName = interaction.options.getString("event", true).trim();

    const targetAt = parseDateTimeInput(datetimeInput, new Date());
    if (!targetAt) {
      await interaction.editReply(
        "❌ 日時の形式が正しくありません。`YYYY/MM/DD HH:mm` または `MM/DD HH:mm` で入力してください。",
      );
      return;
    }

    const deleted = await prisma.calendarEvent.deleteMany({
      where: {
        guildId,
        eventName,
        eventAt: targetAt,
      },
    });

    if (deleted.count === 0) {
      await interaction.editReply(
        "❌ 条件に一致する予定が見つかりませんでした。",
      );
      return;
    }

    await interaction.editReply(
      `✅ 予定を削除しました。\n**日時:** ${targetAt.getFullYear()}/${String(targetAt.getMonth() + 1).padStart(2, "0")}/${String(targetAt.getDate()).padStart(2, "0")} ${String(targetAt.getHours()).padStart(2, "0")}:${String(targetAt.getMinutes()).padStart(2, "0")}\n**イベント:** ${eventName}`,
    );
  } catch (error) {
    console.error("Delete Calender Error:", error);
    await interaction.editReply("❌ 予定の削除中にエラーが発生しました。");
  }
};
