import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient'; // さっき作った道具箱を使う

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
    // 1. ユーザーの入力を取得
    const term = interaction.options.getString('word');
    const meaning = interaction.options.getString('meaning');

    if (!term || !meaning) {
        await interaction.reply({ content: '❌ 入力が足りません！', ephemeral: true });
        return;
    }

    try {
        // 2. データベースに保存
        await prisma.word.create({
            data: {
                term: term,
                meaning: meaning,
            },
        });

        // 3. 完了メッセージ
        await interaction.reply({ content: `✅ **${term}** を辞書に登録しました！` });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ 保存中にエラーが発生しました。', ephemeral: true });
    }
};