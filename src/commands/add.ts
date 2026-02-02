import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient';

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const inputWord = interaction.options.getString('word');
        const meaning = interaction.options.getString('meaning');
        const image = interaction.options.getAttachment('image');

        if (!inputWord || !meaning) {
            await interaction.editReply('❌ 単語と意味を入力してください。');
            return;
        }

        // スラッシュで分割 (例: りんご/Apple)
        const titles = inputWord.split('/').map(t => t.trim()).filter(t => t.length > 0);

        await prisma.word.create({
            data: {
                meaning: meaning,
                imageUrl: image ? image.url : null,
                authorName: interaction.user.username,
                titles: {
                    create: titles.map(t => ({ text: t }))
                }
            },
        });

        const joinedTitle = titles.join(' / ');
        await interaction.editReply(`✅ **「${joinedTitle}」** を登録しました！`);
        
    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラー：その単語は既に登録されている可能性があります。');
    }
};