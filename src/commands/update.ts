import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const targetText = interaction.options.getString('word');
        const newMeaning = interaction.options.getString('meaning');
        const newImage = interaction.options.getAttachment('image');

        if (!targetText || !newMeaning) return;

        // 1. 名前からTitleを探す
        const targetTitle = await prisma.title.findUnique({
            where: { text: targetText },
            include: { word: true }
        });

        if (!targetTitle) {
            await interaction.editReply(`❌ **「${targetText}」** は登録されていません。`);
            return;
        }

        // 2. 親データ(Word)を更新する
        const updateData: any = { meaning: newMeaning };
        if (newImage) updateData.imageUrl = newImage.url;

        const updatedWord = await prisma.word.update({
            where: { id: targetTitle.wordId }, // TitleではなくWordのIDで更新
            data: updateData,
            include: { titles: true } // 結果表示用に全タイトルを取得
        });

        // 3. 結果表示
        const titleList = updatedWord.titles.map(t => t.text).join(' / ');
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('📝 更新完了')
            .setDescription(`**対象:** ${titleList}\n\n**新しい意味:**\n${updatedWord.meaning}`);

        if (updatedWord.imageUrl) embed.setImage(updatedWord.imageUrl);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};

//commit 用