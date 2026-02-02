import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
    // /add
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('新しい単語を辞書に追加します')
        .addStringOption(option =>
            option.setName('word') // 👈 'word' に統一
                .setDescription('単語 (スラッシュ / で区切って複数登録可)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('meaning')
                .setDescription('意味')
                .setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('画像があれば添付してください')
                .setRequired(false)),

    // /list
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('登録された単語の一覧を表示します'),

    // /delete
    new SlashCommandBuilder()
        .setName('delete')
        .setDescription('単語を削除します')
        .addStringOption(option =>
            option.setName('word') // 👈 'word' に統一
                .setDescription('削除する単語')
                .setRequired(true)),

    // /update
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('単語の意味を書き換えます')
        .addStringOption(option =>
            option.setName('word') // 👈 'word' に統一
                .setDescription('書き換える単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('meaning')
                .setDescription('新しい意味')
                .setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('新しい画像があれば添付')
                .setRequired(false)),
    
    // /search
    new SlashCommandBuilder()
        .setName('keyword') // ※コマンド名はsearchではなくkeywordオプションを使う
        .setName('search')
        .setDescription('単語を検索します')
        .addStringOption(option =>
            option.setName('keyword') // searchだけは 'keyword' のままでOK
                .setDescription('検索したい文字')
                .setRequired(true)),

    // /quiz
    new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('登録された単語からクイズを出します'),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log('📦 コマンドの登録を開始します...');
        await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID!),
            { body: commands },
        );
        console.log('✅ コマンド登録が完了しました！');
    } catch (error) {
        console.error(error);
    }
})();