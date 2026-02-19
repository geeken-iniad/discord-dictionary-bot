import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Colors,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import * as Levenshtein from "fast-levenshtein"; // 👈 importの書き方を安全にしました
import { prisma } from "../prismaClient";
const { get } = Levenshtein;

export const data = new SlashCommandBuilder()
  .setName("keyword") // ※コマンド名はsearchではなくkeywordオプションを使う
  .setName("search")
  .setDescription("単語を検索します")
  .addStringOption((option) =>
    option
      .setName("keyword") // searchだけは 'keyword' のままでOK
      .setDescription("検索したい文字")
      .setRequired(true),
  );

// 🪄 魔法の関数: 文字を「小文字」かつ「カタカナ」に統一する
function normalize(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase();
}

export const searchCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  try {
    await interaction.deferReply();

    const keyword = interaction.options.getString("keyword");
    if (!keyword) return;

    // 1. 全てのタイトルを取得する
    // (ここで全部取ってきて、JS側で検索したほうが柔軟な検索ができます)
    const allTitles = await prisma.title.findMany({
      include: { word: true },
    });

    // 2. 正規化して検索 (完全一致 or 部分一致)
    const normalizedKeyword = normalize(keyword);

    const matchedTitles = allTitles.filter((t) => {
      return normalize(t.text).includes(normalizedKeyword);
    });

    // --- ヒットした場合 (そのまま表示) ---
    if (matchedTitles.length > 0) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle(`🔎 「${keyword}」の検索結果`)
        .setDescription(`${matchedTitles.length} 件ヒットしました`);

      const displayedWordIds = new Set();

      // 最初の5件だけ表示
      matchedTitles.slice(0, 5).forEach((title) => {
        if (displayedWordIds.has(title.wordId)) return;
        displayedWordIds.add(title.wordId);

        const word = title.word;
        // 画像セット (最初の1枚だけ)
        if (!embed.data.image && word.imageUrl) embed.setImage(word.imageUrl);
        // リンクセット (最初の1つだけ)
        if (!embed.data.url && word.link) embed.setURL(word.link);

        embed.addFields({
          name: `📌 ${title.text}`,
          value:
            word.meaning.length > 100
              ? word.meaning.substring(0, 97) + "..."
              : word.meaning,
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ---------------------------------------------------------
    // 🚀 もしかして検索 (ヒットしなかった場合)
    // ---------------------------------------------------------

    // 3. レーベンシュタイン距離を計算
    const candidates = allTitles
      .map((t) => {
        const distance = get(keyword.toLowerCase(), t.text.toLowerCase());
        return { ...t, distance };
      })
      .filter((t) => t.distance <= 3) // 3文字以内のミスなら許容
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    if (candidates.length === 0) {
      await interaction.editReply(
        `❌ **「${keyword}」** に一致する単語は見つかりませんでした。`,
      );
      return;
    }

    // 4. 「もしかしてボタン」を作る
    const row = new ActionRowBuilder<ButtonBuilder>();

    candidates.forEach((c) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`fuzzy_${c.wordId}`)
          .setLabel(`${c.text} ?`)
          .setStyle(ButtonStyle.Primary),
      );
    });

    const suggestionEmbed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle("🤔 お探しの単語は見つかりませんでしたが...")
      .setDescription(
        `もしかして、以下の単語のことですか？\nボタンを押すと解説を表示します。`,
      );

    const response = await interaction.editReply({
      embeds: [suggestionEmbed],
      components: [row],
    });

    // 5. ボタン待機処理
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
    });

    collector.on("collect", async (i) => {
      const wordId = parseInt(i.customId.replace("fuzzy_", ""));

      const word = await prisma.word.findUnique({
        where: { id: wordId },
        include: { titles: true },
      });

      if (!word) {
        await i.reply({
          content: "❌ エラー：データが見つかりません",
          ephemeral: true,
        });
        return;
      }

      const titleText = word.titles.map((t) => t.text).join(" / ");
      const resultEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`📚 ${titleText} の解説`)
        .setDescription(word.meaning);

      if (word.imageUrl) resultEmbed.setImage(word.imageUrl);
      if (word.link) resultEmbed.setURL(word.link);

      await i.reply({ embeds: [resultEmbed], ephemeral: true });
    });

    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>();
      candidates.forEach((c) => {
        disabledRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`disabled_${c.wordId}`) // IDは何でもいい
            .setLabel(c.text)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
      });
      await interaction
        .editReply({ components: [disabledRow] })
        .catch(() => {});
    });
  } catch (error) {
    console.error(error);
    await interaction.editReply("❌ エラーが発生しました。");
  }
};
