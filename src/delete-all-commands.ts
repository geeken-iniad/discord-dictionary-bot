// src/delete-all-commands.ts
// ⚠️ 登録されているコマンドを全て削除するツール

import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log('🧹 コマンドのお掃除を開始します...');

        // 1. グローバルコマンドを全消去
        console.log('🌍 グローバルコマンドを削除中...');
        await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID!),
            { body: [] },
        );

        // 2. サーバー専用コマンドを全消去 (GUILD_IDがある場合)
        if (process.env.GUILD_ID) {
            console.log('🏠 サーバー専用コマンドを削除中...');
            await rest.put(
                Routes.applicationGuildCommands(process.env.APPLICATION_ID!, process.env.GUILD_ID),
                { body: [] },
            );
        }

        console.log('✨ 完了！すべてのコマンドが消えました。Discordを再読み込み(Ctrl+R)してください。');
        
    } catch (error) {
        console.error(error);
    }
})();