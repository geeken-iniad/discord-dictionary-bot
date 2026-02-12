// src/index.ts
import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import dotenv from 'dotenv';

// ✨ 作ったバレルファイルをインポート
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
    // contextAdd はスラッシュコマンドではないので、ログからは外しておくと分かりやすいです
    console.log(`コマンド同期完了: /add, /list, /delete, /update, /search, /introduction, /request が使えます`);
});

// ▼ スラッシュコマンド用の対応表
const commandMap: { [key: string]: (interaction: any) => Promise<void> } = {
    'add': commands.addCommand,
    'list': commands.listCommand,
    'delete': commands.deleteCommand,
    'update': commands.updateCommand,
    'search': commands.searchCommand,
    'quiz': commands.quizCommand,
    'introduction': commands.introductionCommand,
    'request': commands.requestCommand,
    // 'contextAdd' はここには書きません（コマンド名が日本語のため別処理にします）
};

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    
    // 🅰️ スラッシュコマンド (ChatInputCommand) の場合
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const command = commandMap[commandName];

        if (command) {
            try {
                await command(interaction);
            } catch (error) {
                console.error(`Command Error: ${commandName}`, error);
                const reply = { content: '❌ エラーが発生しました', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        } else {
            console.error(`コマンド ${commandName} は見つかりませんでした。`);
        }
    } 
    
    // 🅱️ 右クリックメニュー (MessageContextMenuCommand) の場合
    else if (interaction.isMessageContextMenuCommand()) {
        // コマンド名が以下の「どれか」だったら実行する
        if (
            interaction.commandName === '📖 辞書に登録' ||      // (古い名前の互換用)
            interaction.commandName === '📖 意味を引用して登録' || 
            interaction.commandName === '🔖 単語名を引用して登録'
        ) {
            try {
                await commands.contextAddCommand(interaction);
            } catch (error) {
                console.error(`Context Menu Error`, error);
                // ... (エラー処理省略)
            }
        }
    }   
});

// メッセージ辞書機能
client.on(Events.MessageCreate, async (message) => {
    await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);