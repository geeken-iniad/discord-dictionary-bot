import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";
import {
  hasDisallowedMention,
  MENTION_BLOCK_MESSAGE,
} from "../utils/mentionGuard";

export const data = new SlashCommandBuilder()
  .setName("add_wiki")
  .setDescription("Wikipediaから単語の意味を検索し、辞書に自動登録します")
  .addStringOption((option) =>
    option
      .setName("word")
      .setDescription("検索・登録したい単語")
      .setRequired(true),
  );

export const addWikiCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply();

    const word = interaction.options.getString("word", true);
    const guildId = interaction.guildId || "global";

    // Wikipedia REST API を叩く
    const wikiUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      word,
    )}`;

    const response = await fetch(wikiUrl);

    if (!response.ok) {
      await interaction.editReply(
        `❌ Wikipediaで『${word}』が見つかりませんでした`,
      );
      return;
    }

    // JSON パース
    const wikiData = (await response.json()) as {
      type?: string;
      extract?: string;
      title?: string;
    };

    // 曖昧さ回避ページチェック
    if (wikiData.type === "disambiguation") {
      await interaction.editReply(
        `❌ Wikipediaで『${word}』が見つかりませんでした`,
      );
      return;
    }

    // 概要テキストを取得
    const extract = wikiData.extract || "";
    if (!extract) {
      await interaction.editReply(
        `❌ Wikipediaで『${word}』が見つかりませんでした`,
      );
      return;
    }

    // メンション検出（念のため）
    if (hasDisallowedMention(extract)) {
      await interaction.editReply(
        `❌ 取得した概要文に不正な内容が含まれています。`,
      );
      return;
    }

    // 300文字に切り詰める
    const meaning =
      extract.length > 300 ? extract.substring(0, 300) + "..." : extract;

    // Wikipediaのページ URL を構築
    const pageUrl = `https://ja.wikipedia.org/wiki/${encodeURIComponent(
      wikiData.title || word,
    )}`;

    // DB保存
    const titles = word
      .split("/")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await prisma.word.create({
      data: {
        guildId,
        meaning,
        link: pageUrl,
        authorName: interaction.user.username,
        titles: {
          create: titles.map((t) => ({ text: t })),
        },
      },
    });

    // 成功メッセージ (Embed形式)
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`✅ Wikipediaから登録しました！`)
      .addFields(
        { name: "📚 単語", value: `**${word}**`, inline: true },
        { name: "🔗 出典", value: "[Wikipedia](https://ja.wikipedia.org)", inline: true },
      )
      .setDescription(meaning)
      .setURL(pageUrl);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("AddWiki Command Error:", error);

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
