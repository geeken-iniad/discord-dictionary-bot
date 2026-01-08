"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const prisma = new client_1.PrismaClient();
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent,
    ],
});
// ---------------------------------------------------------
// 1. コマンド定義
// ---------------------------------------------------------
// 【追加】 /add: 単語を登録
const addCommand = new discord_js_1.SlashCommandBuilder()
    .setName('add')
    .setDescription('辞書に新しい単語を登録します')
    .addStringOption(option => option.setName('word').setDescription('登録したい単語').setRequired(true))
    .addStringOption(option => option.setName('meaning').setDescription('単語の意味').setRequired(true));
// 【New!】 /list: 登録されている単語一覧を見る
const listCommand = new discord_js_1.SlashCommandBuilder()
    .setName('list')
    .setDescription('登録されている単語の一覧を表示します');
// 【New!】 /delete: 指定した単語を削除する
const deleteCommand = new discord_js_1.SlashCommandBuilder()
    .setName('delete')
    .setDescription('指定した単語を辞書から削除します')
    .addStringOption(option => option.setName('word').setDescription('削除したい単語').setRequired(true));
// ---------------------------------------------------------
// 2. 起動時の処理 (コマンド登録)
// ---------------------------------------------------------
client.once(discord_js_1.Events.ClientReady, (c) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`準備OK！ ${c.user.tag} として管理機能付きで起動しました。`);
    // 定義した3つのコマンドをまとめて登録リストに入れる
    const commands = [
        addCommand.toJSON(),
        listCommand.toJSON(),
        deleteCommand.toJSON()
    ];
    try {
        c.guilds.cache.forEach((guild) => __awaiter(void 0, void 0, void 0, function* () {
            yield guild.commands.set(commands);
        }));
        console.log('コマンド同期完了: /add, /list, /delete が使えます');
    }
    catch (error) {
        console.error('コマンド登録エラー:', error);
    }
}));
// ---------------------------------------------------------
// 3. コマンドを受け取った時の処理
// ---------------------------------------------------------
client.on(discord_js_1.Events.InteractionCreate, (interaction) => __awaiter(void 0, void 0, void 0, function* () {
    if (!interaction.isChatInputCommand())
        return;
    // --- /add (追加) ---
    if (interaction.commandName === 'add') {
        const word = interaction.options.getString('word');
        const meaning = interaction.options.getString('meaning');
        if (word && meaning) {
            try {
                yield prisma.word.upsert({
                    where: { term: word },
                    update: { meaning: meaning },
                    create: { term: word, meaning: meaning },
                });
                const embed = new discord_js_1.EmbedBuilder()
                    .setColor(discord_js_1.Colors.Green)
                    .setTitle('✅ 辞書に登録成功')
                    .addFields({ name: '単語', value: word, inline: true }, { name: '意味', value: meaning, inline: true })
                    .setTimestamp();
                yield interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`DB保存: ${word}`);
            }
            catch (error) {
                console.error(error);
                yield interaction.reply({ content: '保存中にエラーが発生しました。', ephemeral: true });
            }
        }
    }
    // --- /list (一覧) ---
    if (interaction.commandName === 'list') {
        try {
            // DBから全ての単語を取得
            const allWords = yield prisma.word.findMany();
            if (allWords.length === 0) {
                yield interaction.reply({ content: '📭 辞書にはまだ何も登録されていません。', ephemeral: true });
                return;
            }
            // 単語のリストをテキストで作成
            // map関数を使って、['単語A', '単語B'] -> "・単語A\n・単語B" という文字列に変換
            const wordListString = allWords.map(w => `・**${w.term}**: ${w.meaning}`).join('\n');
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_js_1.Colors.Orange)
                .setTitle(`📜 登録単語リスト (${allWords.length}語)`)
                .setDescription(wordListString.substring(0, 4000)) // 文字数制限対策
                .setTimestamp();
            yield interaction.reply({ embeds: [embed], ephemeral: true });
        }
        catch (error) {
            console.error(error);
            yield interaction.reply({ content: 'リスト取得中にエラーが発生しました。', ephemeral: true });
        }
    }
    // --- /delete (削除) ---
    if (interaction.commandName === 'delete') {
        const word = interaction.options.getString('word');
        if (word) {
            try {
                // DBから削除
                yield prisma.word.delete({
                    where: { term: word } // term(単語)が一致するものを探して消す
                });
                yield interaction.reply({
                    content: `🗑️ **「${word}」** を辞書から削除しました。`,
                    ephemeral: true
                });
                console.log(`DB削除: ${word}`);
            }
            catch (error) {
                // 存在しない単語を消そうとした時のエラー対応
                yield interaction.reply({
                    content: `❌ エラー: 「${word}」という単語は見つかりませんでした。`,
                    ephemeral: true
                });
            }
        }
    }
}));
// ---------------------------------------------------------
// 4. メッセージ監視 (解説スレッド作成)
// ---------------------------------------------------------
client.on(discord_js_1.Events.MessageCreate, (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message.author.bot)
        return;
    const allWords = yield prisma.word.findMany();
    for (const data of allWords) {
        if (message.content.includes(data.term)) {
            try {
                const thread = yield message.startThread({
                    name: `解説: ${data.term}`,
                    autoArchiveDuration: 60,
                });
                const embed = new discord_js_1.EmbedBuilder()
                    .setColor(discord_js_1.Colors.Blue)
                    .setTitle(`📚 ${data.term} の解説`)
                    .setDescription(data.meaning)
                    .setFooter({ text: '💡 質問があればチャットしてね' });
                yield thread.send({ embeds: [embed] });
                return;
            }
            catch (error) {
                // エラー無視
            }
        }
    }
}));
client.login(process.env.DISCORD_TOKEN);
//# sourceMappingURL=index.js.map