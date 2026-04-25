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

// 括弧内のテキスト（別名）を抽出する関数
function extractAliases(text: string, maxAliases: number = 3): string[] {
  const aliases: string[] = [];
  // 全角括弧内のテキストを抽出
  const aliasPattern = /（([^）]+)）/g;
  let match;

  while ((match = aliasPattern.exec(text)) && aliases.length < maxAliases) {
    const alias = match[1]?.trim() || "";
    // 1文字以上で、カンマを含まない（複合要素を避けるため）
    if (
      alias &&
      alias.length > 1 &&
      !alias.includes("、") &&
      !alias.includes(",")
    ) {
      aliases.push(alias);
    }
  }

  return aliases;
}

export const data = new SlashCommandBuilder()
  .setName("add-wiki")
  .setDescription("Wikipediaから単語の意味を検索し、辞書に自動登録します")
  .addStringOption((option) =>
    option
      .setName("word")
      .setDescription("検索・登録したい単語")
      .setRequired(true),
  );

async function replyErrorPrivate(
  interaction: ChatInputCommandInteraction,
  message: string,
) {
  try {
    // deferReply() 後の公開プレースホルダーを消して、本人だけにエラーを返す
    if (interaction.deferred && !interaction.replied) {
      await interaction.deleteReply().catch(() => undefined);
    }

    await interaction.followUp({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: message,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
  }
}

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
      await replyErrorPrivate(
        interaction,
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
      await replyErrorPrivate(
        interaction,
        `❌ Wikipediaで『${word}』が見つかりませんでした`,
      );
      return;
    }

    // 概要テキストを取得
    const extract = wikiData.extract || "";
    if (!extract) {
      await replyErrorPrivate(
        interaction,
        `❌ Wikipediaで『${word}』が見つかりませんでした`,
      );
      return;
    }

    // メンション検出（念のため）
    if (hasDisallowedMention(extract)) {
      await replyErrorPrivate(interaction, MENTION_BLOCK_MESSAGE);
      return;
    }

    // 300文字に切り詰める
    const meaning =
      extract.length > 300 ? extract.substring(0, 300) + "..." : extract;

    // Wikipediaのページ URL を構築
    const pageUrl = `https://ja.wikipedia.org/wiki/${encodeURIComponent(
      wikiData.title || word,
    )}`;

    // 別名を抽出
    const aliases = extractAliases(extract, 3);

    // DB保存
    const titles = word
      .split("/")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // 別名を titles に追加（重複排除）
    const normalizedTitles = new Set(titles.map((t) => t.trim().toLowerCase()));
    aliases.forEach((alias) => {
      const normalizedAlias = alias.trim().toLowerCase();
      if (!normalizedTitles.has(normalizedAlias)) {
        titles.push(alias);
        normalizedTitles.add(normalizedAlias);
      }
    });

    await prisma.word.create({
      data: {
        guildId,
        meaning,
        link: pageUrl,
        authorName: interaction.user.username,
        contextLabel: "wiki",
        contextKeywords: aliases.join(","),
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
        {
          name: "🔗 出典",
          value: "[Wikipedia](https://ja.wikipedia.org)",
          inline: true,
        },
      )
      .setDescription(meaning);

    // 別名がある場合は表示
    if (aliases.length > 0) {
      embed.addFields({
        name: "📌 別名",
        value: aliases.join(" / "),
        inline: false,
      });
    }

    embed.setURL(pageUrl);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("AddWiki Command Error:", error);

    await replyErrorPrivate(interaction, "❌ エラーが発生しました。");
  }
};
