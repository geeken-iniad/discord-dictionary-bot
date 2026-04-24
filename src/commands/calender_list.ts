import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

function formatEventDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export const data = new SlashCommandBuilder()
  .setName("calender-list")
  .setDescription("登録されたカレンダー予定を日付順で表示します");

export const calenderListCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply();

    const guildId = interaction.guildId || "global";

    const events = await prisma.calendarEvent.findMany({
      where: { guildId },
      orderBy: { eventAt: "asc" },
      take: 50,
    });

    if (events.length === 0) {
      await interaction.editReply(
        "📭 まだカレンダー予定は登録されていません。",
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("📅 カレンダー予定一覧")
      .setDescription("日付順に表示しています。")
      .addFields(
        events.map((event) => ({
          name: `${formatEventDate(event.eventAt)} | ${event.eventName}`,
          value: event.authorName
            ? `登録者: ${event.authorName}`
            : "登録者: 不明",
          inline: false,
        })),
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Calender List Error:", error);
    await interaction.editReply("❌ 一覧の取得中にエラーが発生しました。");
  }
};
