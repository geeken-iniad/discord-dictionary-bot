// src/index.ts
import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  InteractionReplyOptions, // 👈 追加
  MessageFlags,
} from "discord.js";
import dotenv from "dotenv";

import * as commands from "./commands";
import { handleMessage } from "./events/messageHandler";

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
  console.log(
    `コマンド同期完了: /add, /list, /delete, /update, /search, /introduction, /request が使えます`,
  );
});

const commandMap: { [key: string]: (interaction: any) => Promise<void> } = {
  add: commands.addCommand,
  list: commands.listCommand,
  delete: commands.deleteCommand,
  update: commands.updateCommand,
  search: commands.searchCommand,
  quiz: commands.quizCommand,
  introduction: commands.introductionCommand,
  request: commands.requestCommand,
};

client.on(Events.MessageCreate, async (message) => {
  await handleMessage(message);
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
          content: "❌ エラーが発生しました",
          flags: MessageFlags.Ephemeral,
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
      interaction.commandName === "📖 辞書に登録" ||
      interaction.commandName === "📖 意味を引用して登録" ||
      interaction.commandName === "🔖 単語名を引用して登録"
    ) {
      try {
        await commands.contextAddCommand(interaction);
      } catch (error) {
        console.error(`Context Menu Error`, error);

        // 👇 ここも修正！型を明示します
        const reply: InteractionReplyOptions = {
          content: "❌ エラーが発生しました",
          flags: MessageFlags.Ephemeral,
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
