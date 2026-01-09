import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();


const token = process.env.DISCORD_TOKEN;
const clientId = process.env.APPLICATION_ID;

if (!token || !clientId) {
    console.error('❌ .env に DISCORD_TOKEN または APPLICATION_ID がありません！');
    process.exit(1);
}

// ここにコマンドの定義を書く
const commands = [
    // /add word:xxx meaning:xxx
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('辞書に単語を追加します')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('単語')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('meaning')
                .setDescription('意味')
                .setRequired(true)),

    // /list
    new SlashCommandBuilder()
        .setName('list')
        .setDescription('辞書の一覧を表示します'),
    
    // /delete word:xxx (今後追加予定ならコメントアウトを外す)
    new SlashCommandBuilder()
       .setName('delete')
       .setDescription('辞書から単語を削除します')
       .addStringOption(option => option.setName('word').setDescription('削除する単語').setRequired(true)),

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('📦 コマンドの登録を開始します...');

        // 全サーバーで使えるように登録 (Global Registration)
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('✅ コマンド登録が完了しました！');
    } catch (error) {
        console.error('❌ 登録エラー:', error);
    }
})();