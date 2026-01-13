import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient';

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        // 1. 先に「考え中...」にする (これでタイムアウトを防ぐ)
        await interaction.deferReply();

        const term = interaction.options.getString('term');
        const meaning = interaction.options.getString('meaning');
        const image = interaction.options.getAttachment('image');

        // 入力チェック
        if (!term || !meaning) {
            // ⭕ deferした後なので editReply を使う
            await interaction.editReply('❌ 単語と意味を入力してください。');
            return;
        }

        // データベースに保存
        await prisma.word.create({
            data: {
                term: term,
                meaning: meaning,
                authorName: interaction.user.username,
                imageUrl: image ? image.url : null,
            },
        });

        // 成功メッセージ
        // ⭕ ここも editReply
        await interaction.editReply(`✅ **「${term}」** を登録しました！`);
        
    } catch (error) {
        console.error(error);
        // エラー時も、すでに defer されているなら editReply
        await interaction.editReply('❌ エラーが発生しました。');
    }
};