import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    MessageContextMenuCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import * as Levenshtein from "fast-levenshtein";
import { prisma } from "../prismaClient";

const { get } = Levenshtein;
const MAX_CANDIDATES = 5;
const MIN_SCORE = 0.2;

function normalizeText(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toBigrams(text: string): Set<string> {
  const chars = [...text];
  if (chars.length < 2) {
    const single = chars[0];
    return single ? new Set([single]) : new Set();
  }

  const bigrams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.add(`${chars[i]}${chars[i + 1]}`);
  }
  return bigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function meaningSimilarity(query: string, target: string): number {
  if (!query || !target) return 0;
  if (query === target) return 1;

  const isContainMatch = target.includes(query) || query.includes(target);

  const maxLen = Math.max(query.length, target.length);
  const levSimilarity =
    maxLen === 0 ? 0 : Math.max(0, 1 - get(query, target) / maxLen);

  const bigramSimilarity = jaccardSimilarity(toBigrams(query), toBigrams(target));

  let score = Math.max(levSimilarity, bigramSimilarity);
  if (isContainMatch) {
    score = Math.min(1, score + 0.15);
  }

  return score;
}

export const contextDeleteData = new ContextMenuCommandBuilder()
  .setName("context-delete")
  .setType(ApplicationCommandType.Message);

export const contextDeleteCommand = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId || "global";
    const queryRaw = interaction.targetMessage.content || "";
    const query = normalizeText(queryRaw);

    if (!query) {
      await interaction.editReply(
        "❌ 対象メッセージに本文がありません。説明文を含むメッセージを選んでください。",
      );
      return;
    }

    const words = await prisma.word.findMany({
      where: { guildId },
      include: { titles: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });

    if (words.length === 0) {
      await interaction.editReply("❌ このサーバーには削除候補となる辞書データがありません。");
      return;
    }

    const candidates = words
      .map((word) => {
        const meaning = normalizeText(word.meaning);
        const score = meaningSimilarity(query, meaning);
        return { word, score };
      })
      .filter((item) => item.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      await interaction.editReply(
        "❌ 一致度の高い候補が見つかりませんでした。`/delete` で単語名から削除してください。",
      );
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("context_delete_select")
      .setPlaceholder("削除候補を選択してください");

    candidates.forEach(({ word, score }) => {
      const titleText = word.titles.map((t) => t.text).join(" / ") || "無題";
      const shortMeaning =
        word.meaning.length > 55
          ? `${word.meaning.substring(0, 55)}...`
          : word.meaning;

      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(titleText.substring(0, 100))
          .setDescription(
            `一致度 ${(score * 100).toFixed(0)}% | ${shortMeaning}`.substring(0, 100),
          )
          .setValue(word.id.toString()),
      );
    });

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const listEmbed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("🗑️ context-delete: 候補を選択")
      .setDescription(
        "右クリックしたメッセージ内容と**説明文の一致度**から候補を出しています。\n削除したい項目を選んでください。",
      )
      .setFooter({ text: "この画面はあなたにだけ表示されています" });

    await interaction.editReply({ embeds: [listEmbed], components: [selectRow] });

    const replyMessage = await interaction.fetchReply();
    const selection = await replyMessage.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    const selectedWordId = Number(selection.values[0]);
    const selected = candidates.find((c) => c.word.id === selectedWordId);

    if (!selected) {
      await selection.update({
        content: "❌ 候補が見つかりませんでした。もう一度お試しください。",
        embeds: [],
        components: [],
      });
      return;
    }

    const confirmEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("⚠️ 最終確認")
      .setDescription(
        `以下の辞書データを**意味データごと削除**します。\n\n` +
          `**単語:** ${selected.word.titles.map((t) => t.text).join(" / ")}\n` +
          `**一致度:** ${(selected.score * 100).toFixed(1)}%\n` +
          `**意味(冒頭):** ${selected.word.meaning.substring(0, 120)}${selected.word.meaning.length > 120 ? "..." : ""}`,
      );

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("context_delete_confirm")
        .setLabel("削除する")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("context_delete_cancel")
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary),
    );

    await selection.update({ embeds: [confirmEmbed], components: [confirmRow] });

    const confirmMessage = await interaction.fetchReply();
    const decision = await confirmMessage.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    if (decision.customId === "context_delete_cancel") {
      await decision.update({
        content: "✅ キャンセルしました。削除は行っていません。",
        embeds: [],
        components: [],
      });
      return;
    }

    await prisma.word.delete({ where: { id: selected.word.id } });

    await decision.update({
      content: `🧨 **削除完了**: ${selected.word.titles.map((t) => t.text).join(" / ")}`,
      embeds: [],
      components: [],
    });
  } catch (error) {
    console.error("Context Delete Error:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction
        .editReply({
          content: "❌ context-delete の実行中にエラーが発生しました。",
          embeds: [],
          components: [],
        })
        .catch(() => undefined);
      return;
    }

    await interaction.reply({
      content: "❌ context-delete の実行中にエラーが発生しました。",
      ephemeral: true,
    });
  }
};
