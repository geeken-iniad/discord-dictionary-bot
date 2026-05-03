import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  EmbedBuilder,
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

type PendingDuplicateRegistration = {
  userId: string;
  guildId: string;
  titles: string[];
  meaning: string;
  contextLabel: string | null;
  contextKeywords: string | null;
  imageUrl: string | null;
  link: string | null;
  tag: string | null;
  authorName: string;
};

type ExistingWordSummary = {
  id: number;
  titles: string[];
  meaning: string;
};

const pendingDuplicateRegistrations = new Map<
  string,
  PendingDuplicateRegistration
>();

function makeDuplicateToken(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// 大文字小文字を区別しない重複判定用の正規化
export function normalizeTitleForComparison(text: string): string {
  return text.toLowerCase().trim();
}

function buildCreateWordData(params: {
  guildId: string;
  titles: string[];
  meaning: string;
  contextLabel: string | null;
  contextKeywords: string | null;
  imageUrl: string | null;
  link: string | null;
  tag: string | null;
  authorName: string;
}) {
  return {
    guildId: params.guildId,
    meaning: params.meaning,
    contextLabel: params.contextLabel,
    contextKeywords: params.contextKeywords,
    imageUrl: params.imageUrl,
    link: params.link,
    tag: params.tag,
    authorName: params.authorName,
    titles: {
      create: params.titles.map((t) => ({ text: t })),
    },
  };
}

async function findExistingWords(
  guildId: string,
  titles: string[],
): Promise<ExistingWordSummary[]> {
  const existingTitles = await prisma.title.findMany({
    where: {
      word: { guildId },
    },
    include: {
      word: {
        include: { titles: true },
      },
    },
  });

  // 正規化した入力タイトルを作成
  const normalizedInputTitles = new Set(
    titles.map(normalizeTitleForComparison),
  );

  // DB から取得した結果を、正規化して照合
  const wordMap = new Map<number, ExistingWordSummary>();
  existingTitles.forEach((title) => {
    const normalizedDbTitle = normalizeTitleForComparison(title.text);
    if (!normalizedInputTitles.has(normalizedDbTitle)) {
      return;
    }

    const word = title.word;
    if (!wordMap.has(word.id)) {
      wordMap.set(word.id, {
        id: word.id,
        titles: word.titles.map((item) => item.text),
        meaning: word.meaning,
      });
    }
  });

  return Array.from(wordMap.values());
}

function buildDuplicatePromptEmbed(
  inputTitles: string[],
  existingWords: ExistingWordSummary[],
) {
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("⚠️ すでに同じ単語が登録されています")
    .setDescription(
      `**${inputTitles.join(" / ")}** は既存データと重複しています。\n` +
        "それでも登録する場合は **登録する** を押してください。",
    );

  existingWords.slice(0, 5).forEach((word) => {
    const titleText = word.titles.join(" / ");
    const shortMeaning =
      word.meaning.length > 700
        ? `${word.meaning.slice(0, 700)}...`
        : word.meaning;

    embed.addFields({
      name: `既存: ${titleText}`,
      value: shortMeaning,
    });
  });

  if (existingWords.length > 5) {
    embed.addFields({
      name: "他にも登録あり",
      value: `ほかに ${existingWords.length - 5} 件あります。`,
    });
  }

  return embed;
}

async function showDuplicateConfirmation(
  interaction: ChatInputCommandInteraction,
  params: PendingDuplicateRegistration,
) {
  const token = makeDuplicateToken();
  pendingDuplicateRegistrations.set(token, params);

  const existingWords = await findExistingWords(params.guildId, params.titles);
  const embed = buildDuplicatePromptEmbed(params.titles, existingWords);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`adddup_confirm_${token}`)
      .setLabel("登録する")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`adddup_cancel_${token}`)
      .setLabel("やめる")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: "",
    embeds: [embed],
    components: [row],
  });
}

export const handleDuplicateRegistrationButton = async (
  interaction: ButtonInteraction,
) => {
  const isConfirm = interaction.customId.startsWith("adddup_confirm_");
  const isCancel = interaction.customId.startsWith("adddup_cancel_");

  if (!isConfirm && !isCancel) return;

  const token = interaction.customId
    .replace("adddup_confirm_", "")
    .replace("adddup_cancel_", "");
  const pending = pendingDuplicateRegistrations.get(token);

  if (!pending) {
    await interaction.reply({
      content: "❌ この確認は期限切れです。もう一度 /add を実行してください。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== pending.userId) {
    await interaction.reply({
      content: "❌ この確認は /add を実行した本人だけが操作できます。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  pendingDuplicateRegistrations.delete(token);

  if (isCancel) {
    await interaction.deferUpdate();
    await interaction.editReply({
      content: "❎ 登録をキャンセルしました。",
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.deferUpdate();

  await prisma.word.create({
    data: buildCreateWordData({
      guildId: pending.guildId,
      titles: pending.titles,
      meaning: pending.meaning,
      contextLabel: pending.contextLabel,
      contextKeywords: pending.contextKeywords,
      imageUrl: pending.imageUrl,
      link: pending.link,
      tag: pending.tag,
      authorName: pending.authorName,
    }),
  });

  await interaction.editReply({
    content: `✅ **「${pending.titles.join(" / ")}」** を重複を承知のうえで登録しました！`,
    embeds: [],
    components: [],
  });
};

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

      const existingWords = await findExistingWords(guildId, titles);

      if (existingWords.length > 0) {
        await showDuplicateConfirmation(interaction, {
          userId: interaction.user.id,
          guildId,
          titles,
          meaning: inputMeaning,
          contextLabel: inputContext || null,
          contextKeywords:
            splitContextKeywords(inputKeywords).join(",") || null,
          imageUrl: image ? image.url : null,
          link: inputLink || null,
          tag: inputTag || null,
          authorName: interaction.user.username,
        });
        return;
      }

      await prisma.word.create({
        data: buildCreateWordData({
          guildId,
          titles,
          meaning: inputMeaning,
          contextLabel: inputContext || null,
          contextKeywords:
            splitContextKeywords(inputKeywords).join(",") || null,
          imageUrl: image ? image.url : null,
          link: inputLink || null,
          tag: inputTag || null,
          authorName: interaction.user.username,
        }),
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
      const existingWords = await findExistingWords(guildId, titles);

      if (existingWords.length > 0) {
        const duplicateTexts = existingWords
          .map((word) => word.titles.join(" / "))
          .join(" / ");
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
