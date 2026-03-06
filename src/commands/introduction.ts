import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("introduction")
  .setDescription("このBotの使い方と最新の機能を紹介します");

export const introductionCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("🔰 WordGuideBot の使い方 (最新版)")
    .setDescription(
      "このサーバー専用の用語辞典を作れるBotです！\nチャット中に登録された単語が出ると、スレッドを作って自動で解説してくれます。\n*(※連投防止のため、同じ単語の解説は1チャンネルにつき1時間に1回までです)*",
    )
    .addFields(
      {
        name: "🖱️ メッセージから直接登録 (右クリック/長押し)",
        value:
          `メッセージを **右クリック (スマホは長押し)** → **アプリ** から直接登録画面を開けます！\n` +
          `**📖 意味を引用して登録** : 長文の解説を保存したい時に便利。\n` +
          `**🔖 単語名を引用して登録** : 単語そのものを登録したい時に便利。`,
      },
      {
        name: "📝 コマンドで登録する: `/add`",
        value:
          `・**基本:** \`/add word:単語 meaning:意味\`\n` +
          `・**詳細:** \`tag\`(タグ) や \`link\`(リンク)、\`image\`(画像) も設定可能！\n` +
          `・**一括:** \`word\` に \`A=意味 | B=意味\` と書くと複数まとめて登録できます！`,
      },
      {
        name: "🔍 調べる・見る: `/search` & `/list`",
        value:
          `**/search** : キーワード検索します。うろ覚えでも「もしかして？」と推測してくれます。\n` +
          `**/list** : 登録単語を一覧表示します。\`/list tag:MTG\` のようにタグでの絞り込みや、一覧画面からのタグ付けも可能です！`,
      },
      {
        name: "✏️ 編集する: `/update`",
        value:
          `**/update word** : 登録内容を編集したり、「別名（エイリアス）」を追加できます。\n` +
          `**/update tags** : 検索した単語のタグを **一括で全件更新** できます！（超便利💥）`,
      },
      {
        name: "🗑️ その他・管理コマンド",
        value:
          `**/delete** : 登録した単語や別名を削除します。\n` +
          `**/request** : 辞書にない単語を運営チームにリクエストします。\n` +
          `**/quiz** : 登録された単語からクイズを出題して遊びます。`,
      },
    )
    .setFooter({ text: "💡 英語の短い単語は独立している時のみ反応します / URLだけの投稿には反応しません" });

  await interaction.editReply({ embeds: [embed] });
};