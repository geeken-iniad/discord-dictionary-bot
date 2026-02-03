import { 
    Message, 
    EmbedBuilder, 
    Colors,
    // 👇 TextBasedChannel の代わりに、具体的な型をインポートします
    TextChannel,
    ThreadChannel,
    DMChannel
} from 'discord.js';
import { prisma } from '../prismaClient';

// クールダウン管理用
const cooldowns = new Map<string, number>();

// 🪄 魔法の関数
function normalize(str: string): string {
    return str
        .replace(/[\u3041-\u3096]/g, match => String.fromCharCode(match.charCodeAt(0) + 0x60))
        .toLowerCase();
}

export const handleMessage = async (message: Message) => {
    if (message.author.bot) return;

    // 1. データベースから取得
    const allTitles = await prisma.title.findMany({
        include: { word: true }
    });

    const normalizedContent = normalize(message.content);

    // 2. マッチング
    const hitTitles = allTitles.filter(t => {
        return normalizedContent.includes(normalize(t.text));
    });

    if (hitTitles.length === 0) return;

    // 3. 重複除去
    const uniqueWords = new Map();
    for (const title of hitTitles) {
        uniqueWords.set(title.wordId, title.word);
    }
    const wordsToExplain = Array.from(uniqueWords.values());

    // 4. クールダウン処理
    const now = Date.now();
    const COOLDOWN_TIME = 60 * 60 * 1000;
    
    const validWords = wordsToExplain.filter(word => {
        const key = `word_${word.id}`; 
        const lastTime = cooldowns.get(key);
        if (!lastTime || (now - lastTime > COOLDOWN_TIME)) {
            return true;
        }
        return false;
    });

    if (validWords.length === 0) return;

    try {
        const wordWithTitles = await Promise.all(validWords.map(w => 
            prisma.word.findUnique({ where: { id: w.id }, include: { titles: true } })
        ));

        // flatMapでnull除去
        const validResults = wordWithTitles.flatMap(w => w ? [w] : []);
        
        if (validResults.length === 0) return;

        // 📝 分岐処理
        const isThreadAlready = message.channel.isThread();
        const isDM = !message.inGuild();

        // 📝 修正ポイント: 送信可能なチャンネルの型を並べて指定します
        let targetChannel: TextChannel | ThreadChannel | DMChannel; 

        if (isThreadAlready || isDM) {
            // TypeScriptに「これはTextChannelだと思っていいよ」と強制します
            // (実際にはDMやThreadかもしれませんが、sendメソッドの使い方は同じなのでOKです)
            targetChannel = message.channel as TextChannel;
        } else {
            const titleTerms = validResults
                .map(w => w.titles[0]?.text)
                .filter(t => t)
                .join(', ');

            // startThreadは ThreadChannel を返すのでそのまま代入できます
            targetChannel = await message.startThread({
                name: `解説: ${titleTerms}`.substring(0, 90),
                autoArchiveDuration: 60,
            });
        }

        // 解説カード送信
        for (const word of validResults) {
            const titleText = word.titles.map(t => t.text).join(' / ');
            
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${titleText} の解説`)
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は1時間制限しています' });

            if (word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            await targetChannel.send({ embeds: [embed] });
            
            cooldowns.set(`word_${word.id}`, now);
        }
        
        console.log(`反応しました (Thread: ${!isThreadAlready})`);

    } catch (error) {
        console.error('メッセージ送信エラー:', error);
    }
};