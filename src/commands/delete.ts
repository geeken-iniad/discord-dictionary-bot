import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient';

export const deleteCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const targetText = interaction.options.getString('word'); // 名前を search ではなく word に統一した場合は注意

        if (!targetText) return;

        // 1. その「名前(Title)」を探す
        const targetTitle = await prisma.title.findUnique({
            where: { text: targetText },
            include: { word: true } // どの単語に属しているか確認するため
        });

        if (!targetTitle) {
            await interaction.editReply(`❌ **「${targetText}」** という単語は見つかりませんでした。`);
            return;
        }

        // 2. 削除実行
        await prisma.title.delete({
            where: { id: targetTitle.id }
        });

        // 3. 親のWordに、まだ他の名前が残っているか確認（おまけ機能）
        const remainingTitles = await prisma.title.count({
            where: { wordId: targetTitle.wordId }
        });

        if (remainingTitles === 0) {
             // 名前が0個になったので、本来はWordも消えます（自動連携）
             await interaction.editReply(`🗑️ **「${targetText}」** を削除しました。（解説データも削除されました）`);
        } else {
             await interaction.editReply(`🗑️ **「${targetText}」** を削除しました。（この解説にはまだ別の名前が残っています）`);
        }

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 削除中にエラーが発生しました。');
    }
};