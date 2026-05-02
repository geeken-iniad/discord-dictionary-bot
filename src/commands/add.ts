import {
  ActionRowBuilder,
  ApplicationCommandType,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../prismaClient";
import {
  findDuplicateWithinInput,
  splitContextKeywords,
} from "../utils/contextScoring";
import {
  hasDisallowedMention,
  MENTION_BLOCK_MESSAGE,
} from "../utils/mentionGuard";

export const addFromMeaningData = new ContextMenuCommandBuilder()
  .setName("📖 意味を引用して登録")
  .setType(ApplicationCommandType.Message);

export const addFromWordData = new ContextMenuCommandBuilder()
  .setName("🔖 単語名を引用して登録")
  .setType(ApplicationCommandType.Message);

export const data = new SlashCommandBuilder()
  .setName("add")
  .setDescription("単語を登録します")
  .addStringOption((option) =>
    option
      .setName("word")
      .setDescription('単語 (通常: "りんご/Apple" / 一括: "A=意味 | B=意味")')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("meaning")
      .setDescription("意味 (一括登録の場合は空欄)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("link")
      .setDescription("参考リンク (URL)")
      .setRequired(false),
  )
  .addAttachmentOption((option) =>
    option.setName("image").setDescription("画像").setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("tag")
      .setDescription("タグ/カテゴリー (例: プログラミング, 料理)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("context")
      .setDescription("文脈ラベル (例: programming, animal)")
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("keywords")
      .setDescription("文脈キーワード (カンマ区切り)")
      .setRequired(false),
  );

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply();

    // 👇 【追加】今いるサーバーのIDを取得！(DMの場合は "global" にする)
    const guildId = interaction.guildId || "global";

    const inputWord = interaction.options.getString("word");
    const inputMeaning = interaction.options.getString("meaning");
    const inputLink = interaction.options.getString("link");
    const inputTag = interaction.options.getString("tag");
    const inputContext = interaction.options.getString("context");
    const inputKeywords = interaction.options.getString("keywords");
    const image = interaction.options.getAttachment("image");

    if (!inputWord) return;

    // ---------------------------------------------------
    // パターンA: 通常モード (意味が入力されている場合)
    // ---------------------------------------------------
    if (inputMeaning) {
      if (hasDisallowedMention(inputMeaning)) {
        await interaction.editReply(MENTION_BLOCK_MESSAGE);
        return;
      }

      const titles = inputWord
        .split("/")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const duplicateTitle = findDuplicateWithinInput(titles);

      if (duplicateTitle) {
        await interaction.editReply(
          `❌ **「${duplicateTitle}」** がこの入力内で重複しています。`,
        );
        return;
      }

      // DB内に同じ単語が存在するか確認
      const existingTitles = await prisma.title.findMany({
        where: {
          text: { in: titles },
          word: { guildId: guildId },
        },
      });

      if (existingTitles.length > 0) {
        const duplicateTexts = existingTitles.map((t) => t.text).join("、");
        await interaction.editReply(
          `❌ **「${duplicateTexts}」** はすでに登録されています。`,
        );
        return;
      }

      await prisma.word.create({
        data: {
          guildId: guildId, // 👈 【追加】サーバー名札をつける！
          meaning: inputMeaning,
          contextLabel: inputContext || null,
          contextKeywords:
            splitContextKeywords(inputKeywords).join(",") || null,
          imageUrl: image ? image.url : null,
          link: inputLink,
          tag: inputTag,
          authorName: interaction.user.username,
          titles: {
            create: titles.map((t) => ({ text: t })),
          },
        },
      });

      const joinedTitle = titles.join(" / ");
      await interaction.editReply(`✅ **「${joinedTitle}」** を登録しました！`);
      return;
    }

    // ---------------------------------------------------
    // パターンB: 一括登録モード (意味が空欄の場合)
    // ---------------------------------------------------

    const entries = inputWord
      .split("|")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const validEntries = entries.filter((e) => e.includes("="));

    if (validEntries.length === 0) {
      await interaction.editReply(
        "❌ **一括登録の書き方が違います。**\n意味を空欄にする場合は、以下のように書いてください：\n`word: りんご=赤い果物 | バナナ=黄色い果物`",
      );
      return;
    }

    let successCount = 0;
    const failedWords: string[] = [];

    for (const entry of validEntries) {
      const [titlePart, meaningPart] = entry.split("=").map((s) => s.trim());

      if (!titlePart || !meaningPart) {
        failedWords.push(entry);
        continue;
      }

      if (hasDisallowedMention(meaningPart)) {
        failedWords.push(`${titlePart} (意味にメンションを含むため登録不可)`);
        continue;
      }

      const titles = titlePart
        .split("/")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const duplicateTitle = findDuplicateWithinInput(titles);

      if (duplicateTitle) {
        failedWords.push(`${titlePart} (入力内で重複: ${duplicateTitle})`);
        continue;
      }

      // DB内に同じ単語が存在するか確認
      const existingTitles = await prisma.title.findMany({
        where: {
          text: { in: titles },
          word: { guildId: guildId },
        },
      });

      if (existingTitles.length > 0) {
        const duplicateTexts = existingTitles.map((t) => t.text).join("/");
        failedWords.push(`${titlePart} (既に登録済み: ${duplicateTexts})`);
        continue;
      }

      try {
        await prisma.word.create({
          data: {
            guildId: guildId, // 👈 【追加】ここにもサーバー名札をつける！
            meaning: meaningPart,
            contextLabel: inputContext || null,
            contextKeywords:
              splitContextKeywords(inputKeywords).join(",") || null,
            imageUrl: successCount === 0 && image ? image.url : null,
            link: successCount === 0 && inputLink ? inputLink : null,
            tag: inputTag,
            authorName: interaction.user.username,
            titles: {
              create: titles.map((t) => ({ text: t })),
            },
          },
        });
        successCount++;
      } catch (error) {
        failedWords.push(titlePart);
      }
    }

    let resultMsg = `📦 **一括登録完了！** (${successCount}件)`;

    if (failedWords.length > 0) {
      resultMsg += `\n⚠️ **失敗:** ${failedWords.join(", ")} (既に登録済みかエラー)`;
    }

    await interaction.editReply(resultMsg);
  } catch (error) {
    console.error(error);
    await interaction.editReply("❌ エラーが発生しました。");
  }
};

export const contextAddCommand = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  try {
    const targetMessage = interaction.targetMessage;
    const textContent = targetMessage.content;

    let modalTitle = "";
    let defaultWord = "";
    let defaultMeaning = "";
    let defaultContext = "";
    let defaultKeywords = "";

    if (interaction.commandName === "📖 意味を引用して登録") {
      modalTitle = "引用登録 (意味)";
      defaultMeaning = textContent;
    } else if (interaction.commandName === "🔖 単語名を引用して登録") {
      modalTitle = "引用登録 (単語名)";
      defaultWord = textContent;
    } else {
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("addWordModal_Context")
      .setTitle(modalTitle);

    const wordInput = new TextInputBuilder()
      .setCustomId("wordInput")
      .setLabel("単語")
      .setStyle(TextInputStyle.Short)
      .setValue(defaultWord.substring(0, 100))
      .setRequired(true);

    const meaningInput = new TextInputBuilder()
      .setCustomId("meaningInput")
      .setLabel("意味")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(defaultMeaning.substring(0, 3900))
      .setRequired(true);

    const contextInput = new TextInputBuilder()
      .setCustomId("contextInput")
      .setLabel("文脈ラベル (任意)")
      .setStyle(TextInputStyle.Short)
      .setValue(defaultContext.substring(0, 100))
      .setRequired(false);

    const keywordsInput = new TextInputBuilder()
      .setCustomId("keywordsInput")
      .setLabel("文脈キーワード (任意)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("例: 開発,コード,関数")
      .setValue(defaultKeywords.substring(0, 100))
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(wordInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(contextInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(keywordsInput),
    );

    await interaction.showModal(modal);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "❌ エラーが発生しました。",
      flags: MessageFlags.Ephemeral,
    });
  }
};
