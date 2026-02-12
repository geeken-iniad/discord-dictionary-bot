// src/index.ts
import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import dotenv from 'dotenv';

// ✨ 作ったバレルファイルをインポート（commandsの中身が全部入っています）
import * as commands from './commands';
import { handleMessage } from './events/messageHandler';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, (c) => {
    console.log(`準備OK！ ${c.user.tag} が起動しました。`);
    console.log(`コマンド同期完了: /add, /list, /delete, /update, /search, /introduction, /request, /contextAdd が使えます`);
});

// ▼ 【重要】コマンド名と関数の「対応表（Map）」を作ります
// これが if文の代わりになります
const commandMap: { [key: string]: (interaction: any) => Promise<void> } = {
    'add': commands.addCommand,
    'list': commands.listCommand,
    'delete': commands.deleteCommand,
    'update': commands.updateCommand,
    'search': commands.searchCommand,
    'quiz': commands.quizCommand,
    'introduction': commands.introductionCommand,
    'request': commands.requestCommand,
    'contextAdd': commands.contextAddCommand,
};

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    
    // ▼ 対応表から、コマンド名に一致する関数を探す 
    const command = commandMap[commandName];

    // もし対応する関数があれば実行する
    if (command) {
        try {
            await command(interaction);
        } catch (error) {
            console.error(error);
            // エラー処理を一括管理
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ エラーが発生しました', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ エラーが発生しました', ephemeral: true });
            }
        }
    } else {
        console.error(`コマンド ${commandName} は見つかりませんでした。`);
    }
});

// メッセージ辞書機能
client.on(Events.MessageCreate, async (message) => {
    await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);