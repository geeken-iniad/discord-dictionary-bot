import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const data  =  new SlashCommandBuilder()
        .setName('introduction')
        .setDescription('このBotの使い方と機能を紹介します');

export const introductionCommand = async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🔰 WordGuideBot の使い方')
        .setDescription('みんなで作る用語辞典Botです！\nチャット中に登録された単語が出ると、自動で解説を表示します。')
        .addFields(
            { 
                name: '🖱️ 便利機能（右クリック登録）', 
                value: 
                `メッセージを **右クリック (スマホは長押し)** → **アプリ** から直接登録できます！\n` +
                `**📖 意味を引用して登録** : 長文の解説を保存したい時に便利。\n` +
                `**🔖 単語名を引用して登録** : 単語そのものを登録したい時に便利。`
            },
            { 
                name: '📝 コマンドで登録する', 
                value: 
                `**/add**\n` +
                `・基本: \`/add word:単語 meaning:意味\`\n` +
                `・詳細: \`tag\`(タグ) や \`link\`(リンク)、\`image\`(画像) も設定可能！\n` +
                `・一括: \`word\` に \`A=意味 | B=意味\` と書くとまとめて登録できます。`
            },
            { 
                name: '🔍 調べる・見る', 
                value: 
                `**/search**\n` +
                `キーワード検索します。うろ覚えでも「もしかして？」と教えてくれます。\n` +
                `**/list**\n` +
                `登録単語を一覧表示します。\`/list tag:プログラミング\` のようにタグで絞り込みも可能！`
            },
            { 
                name: '✏️ 管理・その他', 
                value: 
                `**/update** : 登録内容を編集します（タグや画像の追加もここから）。\n` +
                `**/delete** : 単語を削除します。\n` +
                `**/request** : 辞書にない単語を運営にリクエストします。\n` +
                `**/quiz** : 登録単語からクイズを出題します。`
            }
        )
        .setFooter({ text: '💡 URLだけの投稿には反応しません' });

    await interaction.editReply({ embeds: [embed] });
};