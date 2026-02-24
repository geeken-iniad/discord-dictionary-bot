import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { prisma } from "../prismaClient";

export const data = new SlashCommandBuilder()
  .setName("delete")
  .setDescription("単語を削除します")
  .addStringOption((option) =>
    option
      .setName("word") // 👈 'word' に統一
      .setDescription("削除する単語")
      .setRequired(true),
  );

export const deleteCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    // メニューを出すので、自分にしか見えないようにする (ephemeral: true)
    await interaction.deferReply({ ephemeral: true });

    const targetText = interaction.options.getString("word");
    if (!targetText) return;

    // 👇 【追加】今いるサーバーのIDを取得！
    const guildId = interaction.guildId || "global";

    // 1. 入力された単語から、親(Word)と兄弟(Titles)を全部探す
    const targetTitle = await prisma.title.findFirst({
      where: { 
        text: targetText,
        // 👇 【修正】「このサーバーの単語」だけを対象にする！
        word: {
          guildId: guildId 
        }
      },
      include: {
        word: {
          include: { titles: true }, // 兄弟たちも持ってくる
        },
      },
    });

    if (!targetTitle) {
      await interaction.editReply(
        `❌ **「${targetText}」** は登録されていません。`,
      );
      return;
    }

    const word = targetTitle.word;
    const allTitles = word.titles;

    // 2. セレクトメニューの選択肢を作る
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("deleteSelect")
      .setPlaceholder("削除する項目を選択してください...");

    // A. 個別の名前（エイリアス）を消す選択肢
    allTitles.forEach((t) => {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`別名削除: ${t.text}`)
          .setDescription(
            t.text === targetText
              ? "👈 今回入力された単語"
              : "登録されている別名",
          )
          .setValue(`delete_title_${t.id}`)
          .setEmoji("🗑️"),
      );
    });

    // B. 本体ごと全部消す選択肢
    selectMenu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("💥 全削除 (意味データごと消す)")
        .setDescription("解説も、全ての別名も、全部消えます")
        .setValue(`delete_word_${word.id}`)
        .setEmoji("🧨"),
    );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`🗑️ 削除モード: ${targetText}`)
      .setDescription(
        `この解説には **${allTitles.length}個** の名前が登録されています。\n` +
          `どれを削除しますか？下のメニューから選んでください。\n\n` +
          `**意味:**\n${word.meaning.substring(0, 50)}...`,
      );

    // 3. メニューを表示
    const response = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // 4. ユーザーの選択を待つ (制限時間1分)
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    collector.on("collect", async (i) => {
      // 👇 ここで念のためチェックを入れる
      if (!i.values || i.values.length === 0) return;

      const selection = i.values[0];

      // 念のため selection があるか確認 (これでエラーが消えます)
      if (!selection) return;

      if (selection.startsWith("delete_title_")) {
        // --- 個別削除モード ---
        const titleId = parseInt(selection.replace("delete_title_", ""));

        await prisma.title.delete({ where: { id: titleId } });

        const remaining = await prisma.title.count({
          where: { wordId: word.id },
        });

        if (remaining === 0) {
          await i.update({
            content:
              "✅ 最後の名前を削除したため、解説データも消去されました。",
            embeds: [],
            components: [],
          });
        } else {
          await i.update({
            content:
              "✅ 指定された名前（別名）を削除しました。解説データはまだ残っています。",
            embeds: [],
            components: [],
          });
        }
      } else if (selection.startsWith("delete_word_")) {
        // --- 全削除モード ---
        const wordId = parseInt(selection.replace("delete_word_", ""));
        await prisma.word.delete({ where: { id: wordId } });

        await i.update({
          content:
            "🧨 **ドカーン！** 解説データと全ての名前を完全に削除しました。",
          embeds: [],
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        // 時間切れならメニューを消す
        await interaction.editReply({
          content: "⏰ タイムアウトしました。",
          components: [],
        });
      }
    });
  } catch (error) {
    console.error(error);
    // エラー時はメニューを消してエラー表示
    await interaction
      .editReply({ content: "❌ エラーが発生しました。", components: [] })
      .catch(() => null);
  }
};