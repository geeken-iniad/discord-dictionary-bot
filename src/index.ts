import { 
    Client, 
    GatewayIntentBits, 
    Events, 
    SlashCommandBuilder, 
    EmbedBuilder,
    Colors
} from 'discord.js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
const cooldowns = new Map<string, number>();

// ---------------------------------------------------------
// 1. コマンド定義
// ---------------------------------------------------------

// 【追加】 /add: 単語を登録
const addCommand = new SlashCommandBuilder()
    .setName('add')
    .setDescription('辞書に新しい単語を登録します')
    .addStringOption(option =>
        option.setName('word').setDescription('登録したい単語').setRequired(true))
    .addStringOption(option =>
        option.setName('meaning').setDescription('単語の意味').setRequired(true));

// 【New!】 /list: 登録されている単語一覧を見る
const listCommand = new SlashCommandBuilder()
    .setName('list')
    .setDescription('登録されている単語の一覧を表示します');

// 【New!】 /delete: 指定した単語を削除する
const deleteCommand = new SlashCommandBuilder()
    .setName('delete')
    .setDescription('指定した単語を辞書から削除します')
    .addStringOption(option =>
        option.setName('word').setDescription('削除したい単語').setRequired(true));


// ---------------------------------------------------------
// 2. 起動時の処理 (コマンド登録)
// ---------------------------------------------------------
client.once(Events.ClientReady, async (c) => {
    console.log(`準備OK！ ${c.user.tag} として管理機能付きで起動しました。`);

    // 定義した3つのコマンドをまとめて登録リストに入れる
    const commands = [
        addCommand.toJSON(),
        listCommand.toJSON(),
        deleteCommand.toJSON()
    ];

    try {
        c.guilds.cache.forEach(async (guild) => {
            await guild.commands.set(commands);
        });
        console.log('コマンド同期完了: /add, /list, /delete が使えます');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
});

// ---------------------------------------------------------
// 3. コマンドを受け取った時の処理
// ---------------------------------------------------------
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // --- /add (追加) ---
    if (interaction.commandName === 'add') {
        const word = interaction.options.getString('word');
        const meaning = interaction.options.getString('meaning');

        if (word && meaning) {
            try {
                await prisma.word.upsert({
                    where: { term: word },
                    update: { meaning: meaning },
                    create: { term: word, meaning: meaning },
                });

                const embed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle('✅ 辞書に登録成功')
                    .addFields(
                        { name: '単語', value: word, inline: true },
                        { name: '意味', value: meaning, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`DB保存: ${word}`);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: '保存中にエラーが発生しました。', ephemeral: true });
            }
        }
    }

    // --- /list (一覧) ---
    if (interaction.commandName === 'list') {
        try {
            // DBから全ての単語を取得
            const allWords = await prisma.word.findMany();

            if (allWords.length === 0) {
                await interaction.reply({ content: '📭 辞書にはまだ何も登録されていません。', ephemeral: true });
                return;
            }

            // 単語のリストをテキストで作成
            // map関数を使って、['単語A', '単語B'] -> "・単語A\n・単語B" という文字列に変換
            const wordListString = allWords.map(w => `・**${w.term}**: ${w.meaning}`).join('\n');

            const embed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle(`📜 登録単語リスト (${allWords.length}語)`)
                .setDescription(wordListString.substring(0, 4000)) // 文字数制限対策
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'リスト取得中にエラーが発生しました。', ephemeral: true });
        }
    }

    // --- /delete (削除) ---
    if (interaction.commandName === 'delete') {
        const word = interaction.options.getString('word');
        
        if (word) {
            try {
                // DBから削除
                await prisma.word.delete({
                    where: { term: word } // term(単語)が一致するものを探して消す
                });

                await interaction.reply({ 
                    content: `🗑️ **「${word}」** を辞書から削除しました。`, 
                    ephemeral: true 
                });
                console.log(`DB削除: ${word}`);

            } catch (error) {
                // 存在しない単語を消そうとした時のエラー対応
                await interaction.reply({ 
                    content: `❌ エラー: 「${word}」という単語は見つかりませんでした。`, 
                    ephemeral: true 
                });
            }
        }
    }
});

// ---------------------------------------------------------
// 4. メッセージ監視 (解説スレッド作成)
// ---------------------------------------------------------
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const allWords = await prisma.word.findMany();

    // 1. まず、文章に含まれている単語を全部リストアップ
    const hitWords = allWords.filter(data => message.content.includes(data.term));
    
    if (hitWords.length === 0) return;

    // 2. 【ここが新機能】「前回の解説から1時間経っていない単語」を除外する
    const now = Date.now();
    const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間 (ミリ秒)

    const wordsToExplain = hitWords.filter(word => {
        const lastTime = cooldowns.get(word.term);
        
        // まだ記録がない、または1時間以上経っていれば OK (解説する)
        if (!lastTime || (now - lastTime > COOLDOWN_TIME)) {
            return true;
        }
        
        // 1時間以内なら NG (解説しない)
        console.log(`⏳ クールダウン中: ${word.term} (残り時間を無視してスキップ)`);
        return false;
    });

    // 除外した結果、解説すべき単語がなくなったら終了
    if (wordsToExplain.length === 0) return;

    try {
        const titleTerms = wordsToExplain.map(w => w.term).join(', ');
        const threadName = `解説: ${titleTerms}`.substring(0, 90); 

        const thread = await message.startThread({
            name: threadName,
            autoArchiveDuration: 60,
        });

        for (const word of wordsToExplain) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${word.term} の解説`)
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は1時間制限しています' }); // 文言も変更

            await thread.send({ embeds: [embed] });

            // 【重要】解説したら、その単語の「最終時刻」を今に更新する
            cooldowns.set(word.term, now);
        }
        
        console.log(`反応しました: ${titleTerms}`);

    } catch (error) {
        console.error('スレッド作成エラー:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);