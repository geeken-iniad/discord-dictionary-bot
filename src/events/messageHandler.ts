import { Message, EmbedBuilder, Colors, ChannelType } from 'discord.js';
import { prisma } from '../prismaClient';
import * as Levenshtein from 'fast-levenshtein';
const { get } = Levenshtein;

// 正規化関数
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

        // 2. DBから単語取得
        const allTitles = await prisma.title.findMany({
            include: { word: true }
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
            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 解説: ${word.titles[0]?.text || '詳細'}`) // タイトルを取得
                .setDescription(word.meaning)
                .setFooter({ text: '💡 連続での反応は制限されています' });

            if (word.imageUrl) embed.setImage(word.imageUrl);
            if (word.link) embed.setURL(word.link);
            if (word.tag) embed.addFields({ name: '🏷️ タグ', value: word.tag, inline: true });

            return embed;
        });

        // 5. 送信処理（ここが重要！）
        
        // 既にスレッドの中での会話なら、普通に返信する（ただし通知はOFF）
        if (message.channel.type === ChannelType.PublicThread || message.channel.type === ChannelType.PrivateThread) {
            await message.reply({ 
                embeds: embeds,
                allowedMentions: { repliedUser: false } // 👈 これで通知がいかない！
            });
            return;
        }

        // 通常チャンネルなら、スレッドを作ってそこに投稿する
        let thread = message.thread;
        
        // まだスレッドがなければ作る
        if (!thread) {
            try {
                if (hitTitles[0] === undefined ) return;
                
                thread = await message.startThread({
                    name: `解説: ${hitTitles[0].text}`, // スレッド名
                    autoArchiveDuration: 60, // 1時間でアーカイブ
                    reason: '用語解説のため',
                });
            } catch (e) {
                // 権限不足などでスレッドが作れなかったら、仕方ないので普通に返す
                console.error(e);
                await message.reply({ 
                    embeds: embeds, 
                    allowedMentions: { repliedUser: false } // 通知OFF
                });
                return;
            }
        }

        // スレッドの中に書き込む（ReplyではなくSendを使うとより静かです）
        await thread.send({
            content: '用語が見つかりました！', // 何か一言あると親切（なくてもOK）
            embeds: embeds,
            // 念には念を入れ、ここでもメンション通知をOFFにする
            allowedMentions: { repliedUser: false } 
        });

    } catch (error) {
        console.error('AutoResponse Error:', error);
    }
};