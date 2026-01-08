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
    // Bot自身の発言は無視
    if (message.author.bot) return;

    // データベースから全単語を取得
    const allWords = await prisma.word.findMany();

    // 【変更点1】含まれている単語を「全部」見つけてリストにする
    const hitWords = allWords.filter(data => message.content.includes(data.term));

    // 1つも見つからなければここで終了
    if (hitWords.length === 0) return;

    try {
        // 【変更点2】スレッド名は、見つかった単語をカンマ区切りで並べる
        // (長すぎるとエラーになるので、最大50文字くらいで切る処理を入れています)
        const titleTerms = hitWords.map(w => w.term).join(', ');
        const threadName = `解説: ${titleTerms}`.substring(0, 90); 

        // スレッドを1つだけ作成
        const thread = await message.startThread({
            name: threadName,
            autoArchiveDuration: 60,
        });

        // 【変更点3】見つかった単語の数だけループして、カードを投稿する
        for (const word of hitWords) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${word.term} の解説`)
                .setDescription(word.meaning)
                .setFooter({ text: '💡 複数の単語を検知しました' });

            // スレッド内に送信
            await thread.send({ embeds: [embed] });
        }

        console.log(`反応しました: ${titleTerms}`);

    } catch (error) {
        // スレッドが既にあったり、権限がない場合のエラー対策
        console.error('スレッド作成エラー:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);