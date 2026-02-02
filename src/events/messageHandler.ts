import { Message, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

const cooldowns = new Map<string, number>();

export const handleMessage = async (message: Message) => {
    if (message.author.bot) return;

    // 1. データベースから「全ての見出し語」を取得
    // (WordではなくTitleを取得するのがコツ)
    const allTitles = await prisma.title.findMany({
        include: { word: true } // 親である「Word（意味）」も連れてくる
    });

    // 2. 会話に含まれている見出し語を探す
    const hitTitles = allTitles.filter(t => message.content.includes(t.text));
    if (hitTitles.length === 0) return;

    // 3. 同じ意味の単語が複数ヒットした場合のために、重複を除く
    // (「りんご」と「Apple」が両方ヒットしても、解説は1回でいい)
    const uniqueWords = new Map();
    for (const title of hitTitles) {
        uniqueWords.set(title.wordId, title.word);
    }
    const wordsToExplain = Array.from(uniqueWords.values());

    // クールダウン処理などは同じ...
    
    try {
        // ... (スレッド作成処理) ...

        for (const word of wordsToExplain) {
            // 見出し語リストを再取得して表示用に整形
            // (上で取得したwordにはtitlesが含まれていない可能性があるため)
            const wordWithTitles = await prisma.word.findUnique({
                where: { id: word.id },
                include: { titles: true }
            });
            
            if (!wordWithTitles) continue;

            const titleText = wordWithTitles.titles.map(t => t.text).join(' / ');

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${titleText} の解説`) // タイトルが「りんご / Apple」になる
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は1時間制限しています' });

            if (word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            // ... (送信処理) ...
        }
    } catch (error) {
        console.error(error);
    }
};