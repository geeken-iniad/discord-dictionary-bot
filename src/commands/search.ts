import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const searchCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const keyword = interaction.options.getString('keyword');
        if (!keyword) return;

        // 1. Title（見出し語）の中から検索する
        // "contains" なので、部分一致でヒットします
        const matchedTitles = await prisma.title.findMany({
            where: {
                text: { contains: keyword }
            },
            include: { word: true } // 親の「意味」も持ってくる
        });

        if (matchedTitles.length === 0) {
            await interaction.editReply(`❌ **「${keyword}」** に一致する単語は見つかりませんでした。`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(`🔎 「${keyword}」の検索結果`)
            .setDescription(`${matchedTitles.length} 件ヒットしました`);

        // 2. ヒットしたものを表示
        // 重複除去（同じ意味の別名が両方ヒットした場合）は簡易的にやってます
        const displayedWordIds = new Set();

        matchedTitles.slice(0, 5).forEach(title => {
            if (displayedWordIds.has(title.wordId)) return;
            displayedWordIds.add(title.wordId);

            const word = title.word;
            
            // 画像があればセット（最初の1枚だけ）
            if (!embed.data.image && word.imageUrl) {
                embed.setImage(word.imageUrl);
            }

            embed.addFields({
                name: `📌 ${title.text}`, // ヒットした名前
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