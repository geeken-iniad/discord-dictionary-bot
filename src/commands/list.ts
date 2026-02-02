import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply(); 

        // 1. titles (見出し語) も一緒に取得する設定
        const allWords = await prisma.word.findMany({
            include: { titles: true }, // 👈 これ重要！
            orderBy: { createdAt: 'desc' } // 新しい順
        });

        if (allWords.length === 0) {
            await interaction.editReply({ content: '📭 辞書はまだ空っぽです。' });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📖 登録単語リスト')
            .setFooter({ text: `全 ${allWords.length} 件 (最新25件)` })
            .addFields(
                allWords.slice(0, 25).map(word => {
                    // 👇 複数のタイトルを「/」で合体させる
                    const titleText = word.titles.map(t => t.text).join(' / ');
                    
                    const shortMeaning = word.meaning.length > 50 
                        ? word.meaning.substring(0, 50) + '...' 
                        : word.meaning;

                    return {
                        name: titleText, // ここに「りんご / Apple」と出る
                        value: `${shortMeaning}\n*(by ${word.authorName ?? '不明'})*`, 
                        inline: false,
                    };
                })
            );

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '❌ エラーが発生しました。' });
    }
};