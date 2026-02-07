import { 
    ChatInputCommandInteraction, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    EmbedBuilder, 
    Colors 
} from 'discord.js';
import { prisma } from '../prismaClient';

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        // Modalを出すときは deferReply してはいけません！

        const targetText = interaction.options.getString('word');
        const newImage = interaction.options.getAttachment('image');

        if (!targetText) return;

        // 1. データを探す
        const targetTitle = await prisma.title.findFirst({
            where: { text: targetText },
            include: { word: true }
        });

        if (!targetTitle) {
            await interaction.reply({ content: `❌ **「${targetText}」** は登録されていません。`, ephemeral: true });
            return;
        }

        const currentWord = targetTitle.word;

        // 2. モーダル（編集フォーム）を作成
        const modal = new ModalBuilder()
            .setCustomId(`updateModal-${currentWord.id}`)
            .setTitle(`「${targetText}」を編集`);

        // ----------------------------------------------------
        // 3. 入力欄を作る (IDが重複しないように注意！)
        // ----------------------------------------------------

        // ① 意味 (必須)
        const meaningInput = new TextInputBuilder()
            .setCustomId('meaningInput')
            .setLabel("意味")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentWord.meaning)
            .setRequired(true);

        // ② リンク (任意)
        const linkInput = new TextInputBuilder()
            .setCustomId('linkInput') // 👈 ここのIDチェック
            .setLabel("参考リンク (URL)")
            .setStyle(TextInputStyle.Short)
            .setValue(currentWord.link || '') 
            .setRequired(false);

        // ③ タグ (任意)
        const tagInput = new TextInputBuilder()
            .setCustomId('tagInput') // 👈 ここのIDチェック
            .setLabel("タグ (例: ゲーム, 勉強)")
            .setStyle(TextInputStyle.Short)
            .setValue(currentWord.tag || '') 
            .setRequired(false);

        // ④ 別名追加 (任意)
        const addTitleInput = new TextInputBuilder()
            .setCustomId('addTitleInput')
            .setLabel("別名を追加 (スラッシュ区切り)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Apple / 林檎')
            .setRequired(false);

        // 4. コンポーネントを配置 (1つの行に1つの入力)
        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput);
        const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput);
        const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(addTitleInput);

        // まとめてセット！
        modal.addComponents(row1, row2, row3, row4);

        // 5. フォームを表示
        await interaction.showModal(modal);

        // 6. 送信待ち
        const filter = (i: any) => i.customId === `updateModal-${currentWord.id}`;
        
        const submitted = await interaction.awaitModalSubmit({ filter, time: 5 * 60 * 1000 })
            .catch(() => null);

        if (!submitted) return;

        // --- 送信後の処理 ---
        await submitted.deferReply();

        const newMeaning = submitted.fields.getTextInputValue('meaningInput');
        const newLink = submitted.fields.getTextInputValue('linkInput');
        const newTag = submitted.fields.getTextInputValue('tagInput');
        const newTitlesStr = submitted.fields.getTextInputValue('addTitleInput');
        
        const messages: string[] = [];

        // 変更チェック & 更新
        // (意味、画像、リンク、タグ のどれかが変わっていたら更新)
        if (
            newMeaning !== currentWord.meaning || 
            newImage || 
            newLink !== (currentWord.link || '') ||
            newTag !== (currentWord.tag || '')
        ) {
            const updateData: any = { meaning: newMeaning };
            
            if (newImage) updateData.imageUrl = newImage.url;
            
            // 空文字なら null に変換して保存
            updateData.link = newLink ? newLink : null; 
            updateData.tag = newTag ? newTag : null;

            await prisma.word.update({
                where: { id: currentWord.id },
                data: updateData
            });
            messages.push('✅ 本体情報を更新しました');
        }

        // 別名の追加処理
        if (newTitlesStr) {
            const newTitles = newTitlesStr.split('/').map(t => t.trim()).filter(t => t.length > 0);
            let addedCount = 0;
            
            for (const t of newTitles) {
                try {
                    const existing = await prisma.title.findUnique({ where: { text: t } });
                    if (!existing) {
                        await prisma.title.create({
                            data: { text: t, wordId: currentWord.id }
                        });
                        addedCount++;
                    }
                } catch (e) { /* 無視 */ }
            }
            if (addedCount > 0) messages.push(`🆕 別名を **${addedCount}** 個追加しました`);
        }

        if (messages.length === 0) {
            await submitted.editReply('🤔 変更はありませんでした。');
            return;
        }

        // 結果表示
        const updatedWord = await prisma.word.findUnique({
            where: { id: currentWord.id },
            include: { titles: true }
        });

        const allTitles = updatedWord!.titles.map(t => t.text).join(' / ');
        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('📝 編集完了')
            .setDescription(`**現在の名前:** ${allTitles}\n\n**意味:**\n${updatedWord!.meaning}`)
            .setFooter({ text: messages.join('\n') });

        if (updatedWord!.imageUrl) embed.setImage(updatedWord!.imageUrl);
        // タグとリンクの表示も更新
        if (updatedWord!.tag) embed.addFields({ name: '🏷️ タグ', value: updatedWord!.tag, inline: true });
        if (updatedWord!.link) embed.setURL(updatedWord!.link);

        await submitted.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        // showModal後のエラーは拾えないことが多いですが、ログには出ます
    }
};