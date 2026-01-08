import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply(); // 考え中...にする

        // 1. ユーザーの入力を受け取る
        const term = interaction.options.getString('word');
        const newMeaning = interaction.options.getString('meaning');

        if (!term || !newMeaning) {
            await interaction.editReply('❌ 入力が足りません！');
            return;
        }

        // 2. まず、その単語が存在するか探す
        const existingWord = await prisma.word.findFirst({
            where: { term: term },
        });

        if (!existingWord) {
            await interaction.editReply(`❌ **${term}** という単語は見つかりませんでした。`);
            return;
        }

        // 3. 発見したIDを使って更新する (ここがUpdateの本番！)
        const updatedWord = await prisma.word.update({
            where: { id: existingWord.id }, // 見つけたIDを指定
            data: {
                meaning: newMeaning, // 新しい意味で上書き
            },
        });

        // 4. 結果を表示
        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow) // 更新は黄色っぽい色で
            .setTitle('📝 辞書を更新しました')
            .addFields(
                { name: '単語', value: updatedWord.term, inline: true },
                { name: '新しい意味', value: updatedWord.meaning, inline: true },
            );

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 更新中にエラーが発生しました。');
    }
};