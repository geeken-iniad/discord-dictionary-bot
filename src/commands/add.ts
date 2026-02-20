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
  .addStringOption(
    (
      option, // 👈 追加
    ) =>
      option
        .setName("link")
        .setDescription("参考リンク (URL)")
        .setRequired(false),
  )
  .addAttachmentOption((option) =>
    option.setName("image").setDescription("画像").setRequired(false),
  )
  .addStringOption(
    (
      option, // 👈 追加
    ) =>
      option
        .setName("tag")
        .setDescription("タグ/カテゴリー (例: プログラミング, 料理)")
        .setRequired(false),
  );

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply();

    const inputWord = interaction.options.getString("word");
    const inputMeaning = interaction.options.getString("meaning");
    const inputLink = interaction.options.getString("link");
    const inputTag = interaction.options.getString("tag");
    const image = interaction.options.getAttachment("image");

    if (!inputWord) return;

    // ---------------------------------------------------
    // パターンA: 通常モード (意味が入力されている場合)
    // ---------------------------------------------------
    if (inputMeaning) {
      // 今まで通りの処理
      const titles = inputWord
        .split("/")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await prisma.word.create({
        data: {
          meaning: inputMeaning,
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
    // フォーマット: "単語=意味 | 単語=意味"
    // ---------------------------------------------------

    // 1. "|" で区切って複数の塊にする
    const entries = inputWord
      .split("|")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    // フォーマットチェック ( "=" が入っていないとダメ)
    const validEntries = entries.filter((e) => e.includes("="));

    if (validEntries.length === 0) {
      await interaction.editReply(
        "❌ **一括登録の書き方が違います。**\n意味を空欄にする場合は、以下のように書いてください：\n`word: りんご=赤い果物 | バナナ=黄色い果物`",
      );
      return;
    }

    let successCount = 0;
    const failedWords: string[] = [];

    // 2. ループして登録！
    for (const entry of validEntries) {
      // "りんご/Apple = 赤い果物" を "=" で分割
      const [titlePart, meaningPart] = entry.split("=").map((s) => s.trim());

      if (!titlePart || !meaningPart) {
        failedWords.push(entry);
        continue;
      }

      // タイトル分割 (例: "りんご/Apple")
      const titles = titlePart
        .split("/")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      try {
        await prisma.word.create({
          data: {
            meaning: meaningPart,
            // 画像はとりあえず「最初の1個」にだけつける（仕様はお好みで）
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
        // 重複エラーなどはここに来る
        failedWords.push(titlePart);
      }
    }

    // 3. 結果表示
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
    // どのメニューが押されたかで処理を分ける
    const targetMessage = interaction.targetMessage;
    const textContent = targetMessage.content;

    let modalTitle = "";
    let defaultWord = "";
    let defaultMeaning = "";

    if (interaction.commandName === "📖 意味を引用して登録") {
      modalTitle = "引用登録 (意味)";
      defaultMeaning = textContent; // メッセージ内容を「意味」に入れる
    } else if (interaction.commandName === "🔖 単語名を引用して登録") {
      modalTitle = "引用登録 (単語名)";
      defaultWord = textContent; // メッセージ内容を「単語名」に入れる
    } else {
      return; // 知らないコマンドなら何もしない
    }

    // モーダル（入力フォーム）を作る
    const modal = new ModalBuilder()
      .setCustomId("addWordModal_Context") // 通常の登録とは区別するID
      .setTitle(modalTitle);

    const wordInput = new TextInputBuilder()
      .setCustomId("wordInput")
      .setLabel("単語")
      .setStyle(TextInputStyle.Short)
      .setValue(defaultWord.substring(0, 100)) // 長すぎるとエラーになるのでカット
      .setRequired(true);

    const meaningInput = new TextInputBuilder()
      .setCustomId("meaningInput")
      .setLabel("意味")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(defaultMeaning.substring(0, 3900))
      .setRequired(true);

    // 必要ならリンクやタグも追加できますが、一旦シンプルに必須項目だけで

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(wordInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput),
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
