import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();
        const filterTag = interaction.options.getString('tag');

        // 検索条件を作る (タグがあればセット、なければ空っぽ)
        const whereClause = filterTag ? { tag: filterTag } : {};

        // 🔍 ここを修正！
        // 最初から Word (単語本体) を基準に検索します
        const allWords = await prisma.word.findMany({
            where: whereClause, // 👈 ここに条件を入れる！
            include: { titles: true },
            orderBy: { createdAt: 'desc' }
        });

        // データがない場合の処理
        if (allWords.length === 0) {
            const msg = filterTag 
                ? `🏷️ タグ **「${filterTag}」** が付いた単語は見つかりませんでした。`
                : '📭 辞書はまだ空っぽです。`/add` で追加してください！';
            
            await interaction.editReply(msg);
            return;
        }

        // Embedのタイトルも、タグ指定時は変えると親切です
        const titleText = filterTag 
            ? `📖 登録単語リスト (タグ: ${filterTag})` 
            : '📖 登録単語リスト';

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(titleText)
            .setFooter({ text: `全 ${allWords.length} 件 (最新25件)` })
            .addFields(
                allWords.slice(0, 25).map(word => {
                    const titleText = word.titles.map(t => t.text).join(' / ');
                    
                    // 意味が長すぎる場合は省略
                    const shortMeaning = word.meaning.length > 50 
                        ? word.meaning.substring(0, 50) + '...' 
                        : word.meaning;

                    // 投稿者名とタグを表示
                    const authorInfo = word.authorName ? `by ${word.authorName}` : '不明';
                    const tagInfo = word.tag ? ` | 🏷️ ${word.tag}` : '';

                    return {
                        name: titleText,
                        value: `${shortMeaning}\n*(${authorInfo}${tagInfo})*`, 
                        inline: false,
                    };
                })
            );

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};