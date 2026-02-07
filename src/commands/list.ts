import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();
        const filterTag = interaction.options.getString('tag');

        const whereClause = filterTag ? { tag: filterTag } : {};

        const allTitles = await prisma.title.findMany({
        where: {
            word: whereClause // 👈 親(Word)のタグでフィルタリング
        },
        include: { word: true },
        orderBy: { wordId: 'desc' }
    });

    if (allTitles.length === 0) {
        // タグ指定があった場合となかった場合でメッセージを変える
        const msg = filterTag 
            ? `🏷️ タグ **「${filterTag}」** が付いた単語は見つかりませんでした。`
            : '📭 辞書はまだ空っぽです。`/add` で追加してください！';
        
        await interaction.editReply(msg);
        return;
    }

        const allWords = await prisma.word.findMany({
            include: { titles: true },
            orderBy: { createdAt: 'desc' }
        });

        if (allWords.length === 0) {
            await interaction.editReply('📭 辞書はまだ空っぽです。');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📖 登録単語リスト')
            .setFooter({ text: `全 ${allWords.length} 件 (最新25件)` })
            .addFields(
                allWords.slice(0, 25).map(word => {
                    const titleText = word.titles.map(t => t.text).join(' / ');
                    const shortMeaning = word.meaning.length > 50 
                        ? word.meaning.substring(0, 50) + '...' 
                        : word.meaning;

                    return {
                        name: titleText,
                        value: `${shortMeaning}\n*(by ${word.authorName ?? '不明'})*`, 
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