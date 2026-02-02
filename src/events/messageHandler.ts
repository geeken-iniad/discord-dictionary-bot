import { Message, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

// クールダウン管理用
const cooldowns = new Map<string, number>();

export const handleMessage = async (message: Message) => {
    if (message.author.bot) return;

    // 1. データベースから「全ての見出し語」を取得
    const allTitles = await prisma.title.findMany({
        include: { word: true }
    });

    // 2. 会話に含まれている見出し語を探す
    const hitTitles = allTitles.filter(t => message.content.includes(t.text));
    if (hitTitles.length === 0) return;

    // 3. 重複除去
    const uniqueWords = new Map();
    for (const title of hitTitles) {
        uniqueWords.set(title.wordId, title.word);
    }
    const wordsToExplain = Array.from(uniqueWords.values());

    // 4. クールダウン処理
    const now = Date.now();
    const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間
    
    const validWords = wordsToExplain.filter(word => {
        // IDを使ってクールダウン管理
        const key = `word_${word.id}`; 
        const lastTime = cooldowns.get(key);
        if (!lastTime || (now - lastTime > COOLDOWN_TIME)) {
            return true;
        }
        return false;
    });

    if (validWords.length === 0) return;

    try {
        // データを再取得（titlesを含めるため）
        const wordWithTitles = await Promise.all(validWords.map(w => 
            prisma.word.findUnique({ where: { id: w.id }, include: { titles: true } })
        ));

        // ⭐️ 修正ポイント: nullを除外してから処理する
        // (以前はここで w?.titles[0].text と書いてエラーになっていました)
        const validResults = wordWithTitles.filter(w => w !== null);

        if (validResults.length === 0) return;

        // タイトルをつなげてスレッド名にする
        const titleTerms = validResults
            .map(w => w!.titles[0]?.text) // 1つ目の名前を取得
            .filter(t => t) // 万が一名前がない場合は除外
            .join(', ');

        const thread = await message.startThread({
            name: `解説: ${titleTerms}`.substring(0, 90),
            autoArchiveDuration: 60,
        });

        // 解説カード送信
        for (const word of validResults) {
            // ここでは filter済みなので word は null ではないですが、念のため
            if (!word) continue;

            const titleText = word.titles.map(t => t.text).join(' / ');
            
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${titleText} の解説`)
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は1時間制限しています' });

            if (word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            await thread.send({ embeds: [embed] });
            
            // 時間を記録
            cooldowns.set(`word_${word.id}`, now);
        }

        console.log(`反応しました: ${titleTerms}`);

    } catch (error) {
        console.error('スレッド作成エラー:', error);
    }
};