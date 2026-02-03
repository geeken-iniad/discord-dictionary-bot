import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        // 1. 入力を取得
        const targetText = interaction.options.getString('word');
        const newMeaning = interaction.options.getString('meaning');
        const addTitleInput = interaction.options.getString('add_title'); // 追加したい名前
        const newImage = interaction.options.getAttachment('image');

        if (!targetText) return;

        // 2. まず対象の単語(Title)を探す
        const targetTitle = await prisma.title.findFirst({
            where: { text: targetText },
            include: { word: true }
        });

        if (!targetTitle) {
            await interaction.editReply(`❌ **「${targetText}」** は登録されていません。`);
            return;
        }

        const wordId = targetTitle.wordId;
        const messages: string[] = [];

        // 3. 意味や画像の更新があれば実行
        const dataToUpdate: any = {};
        if (newMeaning) dataToUpdate.meaning = newMeaning;
        if (newImage) dataToUpdate.imageUrl = newImage.url;

        if (Object.keys(dataToUpdate).length > 0) {
            await prisma.word.update({
                where: { id: wordId },
                data: dataToUpdate
            });
            messages.push('✅ 本体情報を更新しました');
        }

        // 4. 【新機能】別名の追加処理
        if (addTitleInput) {
            // "Apple / Pomme" -> ["Apple", "Pomme"]
            const newTitles = addTitleInput.split('/').map(t => t.trim()).filter(t => t.length > 0);
            
            let addedCount = 0;
            const failedTitles: string[] = [];

            // 1つずつ登録を試みる（重複エラー回避のため）
            for (const t of newTitles) {
                try {
                    // 既にどこかで使われていないかチェック
                    const existing = await prisma.title.findUnique({ where: { text: t } });
                    if (!existing) {
                        await prisma.title.create({
                            data: { text: t, wordId: wordId }
                        });
                        addedCount++;
                    } else {
                        // 既に存在する場合はスキップ
                        failedTitles.push(t);
                    }
                } catch (e) {
                    failedTitles.push(t);
                }
            }

            if (addedCount > 0) messages.push(`🆕 別名を **${addedCount}** 個追加しました`);
            if (failedTitles.length > 0) messages.push(`⚠️ 登録済みの為スキップ: ${failedTitles.join(', ')}`);
        }

        // 変更が何もなかった場合
        if (messages.length === 0) {
            await interaction.editReply('🤔 変更内容が入力されていません。');
            return;
        }

        // 5. 最終結果を表示
        const updatedWord = await prisma.word.findUnique({
            where: { id: wordId },
            include: { titles: true }
        });

        if (!updatedWord) return;

        const allTitles = updatedWord.titles.map(t => t.text).join(' / ');
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('📝 更新完了')
            .setDescription(`**現在の名前:** ${allTitles}\n\n**意味:**\n${updatedWord.meaning}`)
            .setFooter({ text: messages.join('\n') });

        if (updatedWord.imageUrl) embed.setImage(updatedWord.imageUrl);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};