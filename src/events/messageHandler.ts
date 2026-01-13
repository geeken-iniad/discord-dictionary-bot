import { Message, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

// クールダウン管理用のメモリ (このファイルの中だけで使う)
const cooldowns = new Map<string, number>();

export const handleMessage = async (message: Message) => {
    // Bot自身の発言は無視
    if (message.author.bot) return;

    // データベースから全単語を取得
    const allWords = await prisma.word.findMany();

    // 含まれている単語を検索
    const hitWords = allWords.filter(data => message.content.includes(data.term));
    if (hitWords.length === 0) return;

    // クールダウン処理
    const now = Date.now();
    const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間

    const wordsToExplain = hitWords.filter(word => {
        const lastTime = cooldowns.get(word.term);
        if (!lastTime || (now - lastTime > COOLDOWN_TIME)) {
            return true;
        }
        return false;
    });

    if (wordsToExplain.length === 0) return;

    try {
        // スレッド作成
        const titleTerms = wordsToExplain.map(w => w.term).join(', ');
        const threadName = `解説: ${titleTerms}`.substring(0, 90);

        const thread = await message.startThread({
            name: threadName,
            autoArchiveDuration: 60,
        });

        // 解説カード送信
        for (const word of wordsToExplain) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${word.term} の解説`)
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は1時間制限しています' });


            if (word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            await thread.send({ embeds: [embed] });
            
            // 時間を記録
            cooldowns.set(word.term, now);
        }

        console.log(`反応しました: ${titleTerms}`);

    } catch (error) {
        console.error('スレッド作成エラー:', error);
    }
};