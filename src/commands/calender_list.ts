import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatEventDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function generateGoogleCalendarLink(
  eventName: string,
  eventAt: Date,
  location?: string | null,
  eventDetails?: string | null,
  eventUrl?: string | null,
): string {
  // イベント名をエンコード
  const encodedTitle = encodeURIComponent(eventName);

  // 1時間の duration を想定
  const endTime = new Date(eventAt.getTime() + 60 * 60 * 1000);

  // Google Calendar の dates パラメータは YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS 形式
  const formatGoogleDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}T${hour}${minute}${second}`;
  };

  const startTime = formatGoogleDate(eventAt);
  const endTimeStr = formatGoogleDate(endTime);
  const datesParam = `${startTime}/${endTimeStr}`;

  let url = `https://calendar.google.com/calendar/r/eventedit?text=${encodedTitle}&dates=${datesParam}`;

  // 場所がある場合は location パラメータを追加
  if (location && location.trim()) {
    const encodedLocation = encodeURIComponent(location);
    url += `&location=${encodedLocation}`;
  }

  const detailsParts = [eventDetails?.trim(), eventUrl?.trim()].filter(
    (value): value is string => Boolean(value),
  );

  if (detailsParts.length > 0) {
    const encodedDetails = encodeURIComponent(detailsParts.join("\n\n"));
    url += `&details=${encodedDetails}`;
  }

  return url;
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
    const now = new Date();

    const events = await prisma.calendarEvent.findMany({
      where: {
        guildId,
        eventAt: {
          gte: now,
        },
      },
      orderBy: { eventAt: "asc" },
      take: 50,
    });

    if (events.length === 0) {
      await interaction.editReply(
        "📭 まだ未来のカレンダー予定は登録されていません。",
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("📅 カレンダー予定一覧")
      .setDescription(
        "各予定の Google カレンダーリンクをそのまま開けます。\n場所・詳細・URL もまとめて確認できます。",
      )
      .addFields(
        events.map((event) => {
          const googleCalendarLink = generateGoogleCalendarLink(
            event.eventName,
            event.eventAt,
            event.location,
            event.eventDetails,
            event.eventUrl,
          );
          const authorName = event.authorName || "不明";
          const locationInfo = event.location
            ? `📍 **場所:** ${event.location}`
            : "📍 **場所:** なし";
          const detailsInfo = event.eventDetails
            ? `📝 **詳細:** ${truncateText(event.eventDetails, 120)}`
            : "📝 **詳細:** なし";
          const urlInfo = event.eventUrl
            ? `🔗 **URL:** [開く](${event.eventUrl})`
            : "🔗 **URL:** なし";
          return {
            name: `📌 ${formatEventDate(event.eventAt)} | ${event.eventName}`,
            value: [
              `🗓️ **Google Calendar:** [この予定を開く](${googleCalendarLink})`,
              `👤 **登録者:** ${authorName}`,
              locationInfo,
              detailsInfo,
              urlInfo,
            ].join("\n"),
            inline: false,
          };
        }),
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Calender List Error:", error);
    await interaction.editReply("❌ 一覧の取得中にエラーが発生しました。");
  }
};
