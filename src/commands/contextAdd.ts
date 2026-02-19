// src/commands/contextAdd.ts

import {
  ActionRowBuilder,
  Colors,
  ContextMenuCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../prismaClient";

export const contextAddCommand = async (
  interaction: ContextMenuCommandInteraction,
) => {
  if (!interaction.isMessageContextMenuCommand()) return;

  const targetMessage = interaction.targetMessage;
  const content = targetMessage.content || "";
  const initialImage = targetMessage.attachments.first()?.url || "";

  // ⚖️ ここで判定！「どっちのコマンドで呼ばれた？」
  // "🔖 単語名を引用して登録" なら true
  const isWordMode = interaction.commandName.includes("単語名");

  // 1. モーダル作成
  const modal = new ModalBuilder()
    .setCustomId("contextAddModal")
    .setTitle(isWordMode ? "🔖 単語名を引用して登録" : "📖 意味を引用して登録");

  // 2. 入力欄を作る (isWordMode によって初期値の場所を変える)

  // ① 単語
  const wordInput = new TextInputBuilder()
    .setCustomId("wordInput")
    .setLabel("単語名")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("登録したい単語を入力")
    .setValue(isWordMode ? content.substring(0, 100) : "") // 👈 Wordモードならここに入れる
    .setRequired(true);

  // ② 意味
  const meaningInput = new TextInputBuilder()
    .setCustomId("meaningInput")
    .setLabel("意味")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("解説を入力してください")
    .setValue(isWordMode ? "" : content.substring(0, 4000)) // 👈 違うならここに入れる
    .setRequired(true);

  // ③ リンク (画像があればセット)
  const linkInput = new TextInputBuilder()
    .setCustomId("linkInput")
    .setLabel("参考リンク / 画像URL")
    .setStyle(TextInputStyle.Short)
    .setValue(initialImage)
    .setRequired(false);

  // ④ タグ
  const tagInput = new TextInputBuilder()
    .setCustomId("tagInput")
    .setLabel("タグ")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(wordInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
  );

  // 3. 表示
  await interaction.showModal(modal);

  // 4. 送信待ち (後の処理は前回と同じでOK！)
  const submitted = await interaction
    .awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.customId === "contextAddModal",
    })
    .catch(() => null);

  if (!submitted) return;

  try {
    await submitted.deferReply();

    const word = submitted.fields.getTextInputValue("wordInput");
    const meaning = submitted.fields.getTextInputValue("meaningInput");
    const link = submitted.fields.getTextInputValue("linkInput");
    const tag = submitted.fields.getTextInputValue("tagInput");

    // DB保存処理
    const titles = word
      .split("/")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const newWord = await prisma.word.create({
      data: {
        meaning: meaning,
        link: link || null,
        tag: tag || null,
        imageUrl:
          link && link.match(/\.(jpeg|jpg|gif|png)$/) != null ? link : null,
        authorName: interaction.user.username,
        titles: {
          create: titles.map((t) => ({ text: t })),
        },
      },
    });

    // 完了メッセージ
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`✅ 登録完了: ${titles.join(" / ")}`)
      .setDescription(meaning)
      .setFooter({ text: `登録者: ${interaction.user.username}` });

    if (newWord.imageUrl) embed.setImage(newWord.imageUrl);
    if (tag) embed.addFields({ name: "🏷️ タグ", value: tag });

    await submitted.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await submitted.editReply("❌ エラーが発生しました。");
  }
};
