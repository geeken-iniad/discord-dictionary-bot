import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

// 1. 各コマンドファイルから「コマンド定義 (data)」をインポートします
// ※ ファイルの場所は適宜調整してください
import { data as updateData } from './commands/update';
import { data as listData } from './commands/list';
import { data as addData,
    addFromMeaningData, // 👈 追加
    addFromWordData
 } from './commands/add';
import { data as deleteData } from './commands/delete';
import { data as searchData } from './commands/search'; // ファイル名が search.ts の場合
import { data as introData } from './commands/introduction'; // introduction.ts
import { data as requestData } from './commands/request'; // request.ts

// もし ContextMenu も別ファイルにしているならインポート。
// まだファイルがないなら、ここ（deploy-commands.ts）に直接書いてもOKですが、
// 今回は「update」を直すのが最優先なので、updateだけは絶対にインポートを使います。

dotenv.config();

const commands = [
    updateData.toJSON(), // 👈 これで新しい「サブコマンド付きupdate」が登録されます！
    listData.toJSON(),
    addData.toJSON(),
    addFromMeaningData.toJSON(), // 👈 配列に追加
    addFromWordData.toJSON(),
    deleteData.toJSON(),
    searchData.toJSON(),
    introData.toJSON(),
    requestData.toJSON(),
    
    // コンテキストメニュー（もしファイルがないなら、一旦ここに直接書いてもOK）
    // 必要ならここに ContextMenuCommandBuilder の .toJSON() を追加
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log('📦 コマンドの登録を開始します...');

        const clientId = process.env.APPLICATION_ID!;
        const guildId = process.env.GUILD_ID!; // 開発用サーバーID

        // ⚠️ 重要：開発中は「サーバー専用コマンド」を使う（反映が早いから）
        
        // 1. グローバルコマンド（反映が遅い）を一旦消す
        // （二重登録を防ぐため）
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log('🗑️ 古いグローバルコマンドを削除しました');

        // 2. サーバー専用コマンドとして登録（即時反映！）
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log('✅ サーバー専用コマンドを登録しました！即反映されるはずです！');
        } else {
            console.warn('⚠️ GUILD_ID が設定されていません。.envを確認してください。');
        }

    } catch (error) {
        console.error('❌ コマンド登録エラー:', error);
    }
})();