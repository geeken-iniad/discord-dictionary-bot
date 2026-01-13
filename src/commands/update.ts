import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply(); // 考え中...

        // 1. 入力を受け取る (名前は 'word' で統一！)
        const term = interaction.options.getString('word');
        const newMeaning = interaction.options.getString('meaning');
        const newImage = interaction.options.getAttachment('image'); // 📸 画像を受け取る

        if (!term || !newMeaning) {
            await interaction.editReply('❌ 入力が足りません！');
            return;
        }

        // 2. 既存の単語を探す
        const existingWord = await prisma.word.findFirst({
            where: { term: term },
        });

        if (!existingWord) {
            await interaction.editReply(`❌ **${term}** という単語は見つかりませんでした。`);
            return;
        }

        // 3. 更新用データを作る (ここがポイント✨)
        // 基本は「意味」を更新
        const updateData: any = {
            meaning: newMeaning,
        };

        // もし「新しい画像」があれば、それも更新リストに加える
        if (newImage) {
            updateData.imageUrl = newImage.url;
        }
        // ※画像がない場合は、何もしないので「前の画像」がそのまま残ります！

        // 4. データベースを更新！
        const updatedWord = await prisma.word.update({
            where: { id: existingWord.id },
            data: updateData,
        });

        // 5. 結果を表示
        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('📝 辞書を更新しました')
            .addFields(
                { name: '単語', value: updatedWord.term, inline: true },
                { name: '新しい意味', value: updatedWord.meaning, inline: true },
            );

        // 画像があれば表示
        if (updatedWord.imageUrl) {
            embed.setImage(updatedWord.imageUrl);
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 更新中にエラーが発生しました。');
    }
};