import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';

export const introductionCommand = async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🔰 WordGuideBot の使い方')
        .setDescription('自分だけの辞書を作れるBotです！\n現在利用可能なコマンドは以下の通りです。')
        .addFields(
            { 
                name: '📝 単語を登録する', 
                value: 
                `**/add**\n` +
                `・基本: \`/add word:りんご/Apple meaning:赤い果物\`\n` +
                `・リンク付き: \`link\` オプションでURLを設定可能\n` +
                `・一括登録: \`word\` に \`A=意味 | B=意味\` と書いて送信`
            },
            { 
                name: '🔍 調べる', 
                value: 
                `**/search**\n` +
                `キーワードで検索します。「もしかして検索」機能付き！\n` +
                `**/list**\n` +
                `登録されている単語を一覧表示します。`
            },
            { 
                name: '✏️ 編集・削除', 
                value: 
                `**/update**\n` +
                `専用フォームを開いて、意味やリンクを書き直したり、別名を追加したりできます。\n` +
                `**/delete**\n` +
                `メニューから「特定の呼び名だけ消す」か「丸ごと消す」か選べます。`
            },
            { 
                name: '🎮 その他', 
                value: 
                `**/quiz** : 登録単語からクイズを出題！\n` +
                `**自動反応** : 会話の中に登録単語が出ると、自動で解説します。`
            }
        )
        .setFooter({ text: '🚧 機能は開発中のため、今後変更される可能性があります' }); // 👈 ここ重要！

    await interaction.editReply({ embeds: [embed] });
};