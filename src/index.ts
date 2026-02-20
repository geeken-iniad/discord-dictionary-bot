// src/index.ts
import { 
    Client, 
    Events, 
    GatewayIntentBits, 
    Interaction, 
    MessageFlags, 
    InteractionReplyOptions // 👈 追加
} from 'discord.js';
import dotenv from 'dotenv';

import * as commands from './commands';
import { handleMessage } from './events/messageHandler';

dotenv.config();
const replyCooldowns = new Map<string, number>();
const COOLDOWN_TIME = 60 * 60 * 1000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, (c) => {
    console.log(`準備OK！ ${c.user.tag} が起動しました。`);
    console.log(`コマンド同期完了: /add, /list, /delete, /update, /search, /introduction, /request が使えます`);
});

const commandMap: { [key: string]: (interaction: any) => Promise<void> } = {
    'add': commands.addCommand,
    'list': commands.listCommand,
    'delete': commands.deleteCommand,
    'update': commands.updateCommand,
    'search': commands.searchCommand,
    'quiz': commands.quizCommand,
    'introduction': commands.introductionCommand,
    'request': commands.requestCommand,
};

client.on('messageCreate', async (message) => {
    // Bot自身の発言には反応しない
    if (message.author.bot) return;

    // 👇 ② ストッパー（クールダウン判定）をここに入れます
    const guildId = message.guildId || 'DM'; // どのサーバーからのメッセージか確認
    const lastReplyTime = replyCooldowns.get(guildId) || 0; // 前回反応した時間を取得（初めてなら0）
    const now = Date.now(); // 今の時間

    // 前回の反応から1時間（COOLDOWN_TIME）経っていなければ、ここで処理を終了（無視）する！
    if (now - lastReplyTime < COOLDOWN_TIME) {
        return; 
    }

    // ==========================================
    // 👇 ③ ここに「単語に反応して意味を返す」などの、実際の処理を書きます
    // (既に書かれているコードがあれば、そのまま残してください)
    
    // 例: 単語が含まれているかチェックして、返信する処理
    // const hasWord = ... 
    // if (hasWord) {
    //     await message.reply('意味は〇〇です！');
    // ==========================================

        // 👇 ④ 【重要】Botが反応（返信）し終わったら、「今反応したよ！」とメモ帳に時間を書き込みます
        replyCooldowns.set(guildId, now);
        console.log(`⏱️ サーバー(${guildId})で反応しました。ここから1時間おやすみします。`);
        
    // } // if(hasWord) の閉じカッコなど
});



client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    
    // 🅰️ スラッシュコマンド
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const command = commandMap[commandName];

        if (command) {
            try {
                await command(interaction);
            } catch (error) {
                console.error(`Command Error: ${commandName}`, error);
                
                // 👇 ここを修正！型を明示します
                const reply: InteractionReplyOptions = { 
                    content: '❌ エラーが発生しました', 
                    flags: MessageFlags.Ephemeral 
                };
                
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
    
    // 🅱️ 右クリックメニュー
    else if (interaction.isMessageContextMenuCommand()) {
        if (
            interaction.commandName === '📖 辞書に登録' ||
            interaction.commandName === '📖 意味を引用して登録' || 
            interaction.commandName === '🔖 単語名を引用して登録'
        ) {
            try {
                await commands.contextAddCommand(interaction);
            } catch (error) {
                console.error(`Context Menu Error`, error);
                
                // 👇 ここも修正！型を明示します
                const reply: InteractionReplyOptions = { 
                    content: '❌ エラーが発生しました', 
                    flags: MessageFlags.Ephemeral 
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);