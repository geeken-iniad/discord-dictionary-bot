import { Client, Events, GatewayIntentBits, Interaction } from 'discord.js';
import dotenv from 'dotenv';

// 作ったファイルを読み込む
import { addCommand } from './commands/add';
import { listCommand } from './commands/list';
import { deleteCommand } from './commands/delete';
import { handleMessage } from './events/messageHandler';
import { updateCommand } from './commands/update';

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
});

// ▼ コマンド処理の分岐がこれだけで済む！
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'add') {
        await addCommand(interaction);
    } else if (commandName === 'list') {
        await listCommand(interaction);
    } else if (commandName === 'delete'){
        await deleteCommand(interaction);
    } else if (commandName === 'update') { // 👈 ここに追加！
        await updateCommand(interaction);
    }
});

// ▼ 辞書機能も1行で呼び出すだけ！
client.on(Events.MessageCreate, async (message) => {
    await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);

//updateの検証