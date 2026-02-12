import { REST, Routes, ContextMenuCommandBuilder, ApplicationCommandType, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
    // /add

    // SlashCommnedBuilderから設定できる。その後は.addなんとかで各項目の設定
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('単語を登録します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('単語 (通常: "りんご/Apple" / 一括: "A=意味 | B=意味")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('meaning')
                .setDescription('意味 (一括登録の場合は空欄)')
                .setRequired(false))
        .addStringOption(option =>  // 👈 追加
            option.setName('link')
                .setDescription('参考リンク (URL)')
                .setRequired(false))
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('画像')
                .setRequired(false))
        .addStringOption(option =>   // 👈 追加
            option.setName('tag')
                .setDescription('タグ/カテゴリー (例: プログラミング, 料理)')
                .setRequired(false)),

    // /list
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('登録された単語の一覧を表示します')
        .addStringOption(option =>   // 👈 追加
            option.setName('tag')
                .setDescription('このタグが付いた単語だけを表示')),

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
        .setDescription('編集フォームを開いて更新します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('編集したい単語')
                .setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image')
                .setDescription('新しい画像')
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
        
    new SlashCommandBuilder()
        .setName('introduction')
        .setDescription('このBotの使い方と機能を紹介します'),

    new SlashCommandBuilder()
        .setName('request')
        .setDescription('辞書に登録してほしい単語を運営にリクエストします')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('リクエストしたい単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('comment')
                .setDescription('補足や応援メッセージ (任意)')
                .setRequired(false)),

    // ① 既存のやつ (名前を分かりやすく変更推奨)
    new ContextMenuCommandBuilder()
        .setName('📖 意味を引用して登録') // 👈 変更
        .setType(ApplicationCommandType.Message),

    // ② 新しく追加するやつ
    new ContextMenuCommandBuilder()
        .setName('🔖 単語名を引用して登録') // 👈 追加！
        .setType(ApplicationCommandType.Message),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

// src/deploy-commands.ts の後半部分

(async () => {
    try {
        console.log('📦 コマンドの登録を開始します...');

        // 1. グローバルコマンド（どこでも使えるやつ）を上書き登録
        await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID!),
            { body: commands },
        );
        console.log('✅ グローバルコマンドの登録完了！');

        // 👇 2. 【追加】古い「サーバー専用コマンド」があれば削除する
        // (もし .env に GUILD_ID があれば実行)
        if (process.env.GUILD_ID) {
            console.log('🗑️ 古いサーバー専用コマンドを削除中...');
            await rest.put(
                Routes.applicationGuildCommands(process.env.APPLICATION_ID!, process.env.GUILD_ID),
                { body: [] }, // 空っぽのリストを送って全消去
            );
            console.log('✨ サーバー専用コマンドを削除しました！');
        }

    } catch (error) {
        console.error(error);
    }
})();