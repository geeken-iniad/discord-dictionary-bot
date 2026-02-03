import { Message, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

// クールダウン管理用
const cooldowns = new Map<string, number>();

// 🪄 魔法の関数: 文字を「小文字」かつ「カタカナ」に統一する
function normalize(str: string): string {
    return str
        // 1. ひらがな → カタカナ 変換
        .replace(/[\u3041-\u3096]/g, match => String.fromCharCode(match.charCodeAt(0) + 0x60))
        // 2. 英語の大文字 → 小文字 変換
        .toLowerCase();
}

export const handleMessage = async (message: Message) => {
    if (message.author.bot) return;

    // 1. データベースから「全ての見出し語」を取得
    const allTitles = await prisma.title.findMany({
        include: { word: true }
    });

    // メッセージの内容を「正規化」する (例: "Apple" -> "apple", "りんご" -> "リンゴ")
    const normalizedContent = normalize(message.content);

    // 2. 正規化した状態でマッチングチェック
    const hitTitles = allTitles.filter(t => {
        // 登録されている単語も「正規化」して比較する！
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
    const COOLDOWN_TIME = 60 * 60 * 1000; // 1時間
    
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
        // データを再取得
        const wordWithTitles = await Promise.all(validWords.map(w => 
            prisma.word.findUnique({ where: { id: w.id }, include: { titles: true } })
        ));

        const validResults = wordWithTitles.filter(w => w !== null);
        if (validResults.length === 0) return;

        // タイトルをつなげてスレッド名にする
        const titleTerms = validResults
            .map(w => w!.titles[0]?.text)
            .filter(t => t)
            .join(', ');

        const thread = await message.startThread({
            name: `解説: ${titleTerms}`.substring(0, 90),
            autoArchiveDuration: 60,
        });

        // 解説カード送信
        for (const word of validResults) {
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
            
            cooldowns.set(`word_${word.id}`, now);
        }
        console.log(`反応しました: ${titleTerms}`);

    } catch (error) {
        console.error('スレッド作成エラー:', error);
    }
};