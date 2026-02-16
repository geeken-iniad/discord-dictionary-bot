import { Message, EmbedBuilder, Colors, ChannelType } from 'discord.js';
import { prisma } from '../prismaClient';

// 正規化関数 (importがなければここで定義してもOK)
function normalize(str: string): string {
    return str
        .replace(/[\u3041-\u3096]/g, match => String.fromCharCode(match.charCodeAt(0) + 0x60))
        .toLowerCase();
}

export const handleMessage = async (message: Message) => {
    // Bot自身の発言や、Botへのメンションなどは無視
    if (message.author.bot) return;
    if (!message.guild) return; // DMは無視

    try {
        // 1. URL除去 & 正規化
        const contentWithoutUrl = message.content.replace(/https?:\/\/[^\s]+/g, '');
        if (!contentWithoutUrl.trim()) return;
        const normalizedContent = normalize(contentWithoutUrl);

        // 2. DBから単語取得 【👇ここを修正しました！】
        const allTitles = await prisma.title.findMany({
            include: { 
                word: {
                    include: { titles: true } // 👈 これを追加！単語に紐づく全タイトルを取得します
                } 
            }
        });

        // 3. マッチング
        const hitTitles = allTitles.filter(t => {
            return normalizedContent.includes(normalize(t.text));
        });

        if (hitTitles.length === 0 ) return;

        // 重複除去 (同じ単語の別名などが複数ヒットした場合用)
        const uniqueWords = new Map();
        hitTitles.forEach(t => uniqueWords.set(t.wordId, t.word));
        const hits = Array.from(uniqueWords.values());

        // 4. 解説Embedを作成
        const embeds = hits.map(word => {
            // word.titles が確実に配列として存在するようになるのでエラーが消えます
            const titleText = (word.titles && word.titles.length > 0) ? word.titles[0].text : '詳細';

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 解説: ${titleText}`) 
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は制限されています' });

            if (word.imageUrl) embed.setImage(word.imageUrl);
            if (word.link) embed.setURL(word.link);
            if (word.tag) embed.addFields({ name: '🏷️ タグ', value: word.tag, inline: true });

            return embed;
        });

        // 5. 送信処理
        
        // 既にスレッドの中での会話なら、普通に返信する
        if (message.channel.type === ChannelType.PublicThread || message.channel.type === ChannelType.PrivateThread) {
            await message.reply({ 
                embeds: embeds,
                allowedMentions: { repliedUser: false } 
            });
            return;
        }

        // 通常チャンネルなら、スレッドを作ってそこに投稿する
        let thread = message.thread;
        
        // まだスレッドがなければ作る
        if (!thread) {
            try {
                if (!hitTitles[0]) return;
                
                thread = await message.startThread({
                    name: `解説: ${hitTitles[0].text}`, 
                    autoArchiveDuration: 60, 
                    reason: '用語解説のため',
                });
            } catch (e) {
                console.error(e);
                await message.reply({ 
                    embeds: embeds, 
                    allowedMentions: { repliedUser: false } 
                });
                return;
            }
        }

        // スレッドの中に書き込む
        await thread.send({
            content: '用語が見つかりました！', 
            embeds: embeds,
            allowedMentions: { repliedUser: false } 
        });

    } catch (error) {
        console.error('AutoResponse Error:', error);
    }
};