import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const searchCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const keyword = interaction.options.getString('keyword');
        if (!keyword) return;

        const matchedTitles = await prisma.title.findMany({
            where: { text: { contains: keyword } },
            include: { word: true }
        });

        if (matchedTitles.length === 0) {
            await interaction.editReply(`❌ **「${keyword}」** に一致する単語は見つかりませんでした。`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(`🔎 「${keyword}」の検索結果`)
            .setDescription(`${matchedTitles.length} 件ヒットしました`);

        const displayedWordIds = new Set();
        matchedTitles.slice(0, 5).forEach(title => {
            if (displayedWordIds.has(title.wordId)) return;
            displayedWordIds.add(title.wordId);

            const word = title.word;
            if (!embed.data.image && word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            embed.addFields({
                name: `📌 ${title.text}`,
                value: word.meaning,
                inline: false,
            });
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};