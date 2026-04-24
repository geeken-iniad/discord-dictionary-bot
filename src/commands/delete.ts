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

    // 1. 入力された単語から、候補を全部探す
    const matchingTitles = await prisma.title.findMany({
      where: {
        text: targetText,
        // 👇 【修正】「このサーバーの単語」だけを対象にする！
        word: {
          guildId: guildId,
        },
      },
      include: {
        word: {
          include: { titles: true }, // 兄弟たちも持ってくる
        },
      },
    });

    const uniqueWords = Array.from(
      new Map(
        matchingTitles.map((title) => [title.word.id, title.word]),
      ).values(),
    );

    if (uniqueWords.length === 0) {
      await interaction.editReply(
        `❌ **「${targetText}」** は登録されていません。`,
      );
      return;
    }

    const initialWord = uniqueWords[0];
    if (!initialWord) {
      await interaction.editReply("❌ 候補が見つかりませんでした。");
      return;
    }

    let word = initialWord;

    if (uniqueWords.length > 1) {
      const chooseMenu = new StringSelectMenuBuilder()
        .setCustomId("deleteChooseWord")
        .setPlaceholder("削除対象の候補を選択してください...")
        .addOptions(
          uniqueWords.slice(0, 25).map((candidate) => {
            const titleText = candidate.titles.map((t) => t.text).join(" / ");
            const contextText = candidate.contextLabel || "no context";
            const shortMeaning =
              candidate.meaning.length > 60
                ? `${candidate.meaning.substring(0, 57)}...`
                : candidate.meaning;

            return new StringSelectMenuOptionBuilder()
              .setLabel(titleText.substring(0, 100))
              .setDescription(
                `${contextText} | ${shortMeaning}`.substring(0, 100),
              )
              .setValue(candidate.id.toString());
          }),
        );

      const chooseRow =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          chooseMenu,
        );

      await interaction.editReply({
        content: `🔎 **「${targetText}」** に一致する候補が複数あります。削除したいものを選んでください。`,
        embeds: [],
        components: [chooseRow],
      });

      const chooseMessage = await interaction.fetchReply();
      const chooseSelection = await chooseMessage.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) => i.user.id === interaction.user.id,
      });

      const selectedId = Number(chooseSelection.values[0]);
      const selectedWord = uniqueWords.find(
        (candidate) => candidate.id === selectedId,
      );

      if (!selectedWord) {
        await chooseSelection.update({
          content: "❌ 候補が見つかりませんでした。",
          components: [],
          embeds: [],
        });
        return;
      }

      word = selectedWord;
    }

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
