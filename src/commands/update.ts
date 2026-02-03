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
        // ⚠️ Modalを出すときは deferReply してはいけません！ (Discordのルール)
        // await interaction.deferReply();  <-- これは削除

        const targetText = interaction.options.getString('word');
        const newImage = interaction.options.getAttachment('image');

        if (!targetText) return;

        // 1. まず対象のデータをデータベースから探す
        const targetTitle = await prisma.title.findFirst({
            where: { text: targetText },
            include: { word: true }
        });

        if (!targetTitle) {
            // 見つからない場合はここで返信
            await interaction.reply({ content: `❌ **「${targetText}」** は登録されていません。`, ephemeral: true });
            return;
        }

        const currentWord = targetTitle.word;

        // 2. モーダル（編集フォーム）を作成
        const modal = new ModalBuilder()
            .setCustomId(`updateModal-${currentWord.id}`) // IDを埋め込んでおく
            .setTitle(`「${targetText}」を編集`);

        // 3. 入力欄を作る（ここに現在の意味を埋め込む！）
        const meaningInput = new TextInputBuilder()
            .setCustomId('meaningInput')
            .setLabel("意味 (現在の内容が入っています)")
            .setStyle(TextInputStyle.Paragraph) // 複数行OK
            .setValue(currentWord.meaning) // 👈 これがやりたかった機能！
            .setRequired(true);

        const addTitleInput = new TextInputBuilder()
            .setCustomId('addTitleInput')
            .setLabel("別名を追加 (スラッシュ区切り)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Apple / 林檎')
            .setRequired(false);

        // コンポーネントを配置
        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(addTitleInput);
        modal.addComponents(row1, row2);

        // 4. フォームを表示！
        await interaction.showModal(modal);

        // 5. ユーザーがフォームを送信するのを待つ (制限時間5分)
        const filter = (i: any) => i.customId === `updateModal-${currentWord.id}`;
        
        // ここで送信ボタンが押されるまで待機します
        const submitted = await interaction.awaitModalSubmit({ filter, time: 5 * 60 * 1000 })
            .catch(() => null);

        if (!submitted) {
            // タイムアウトした場合
            return; 
            // ※Modalのタイムアウト時は何も返さなくてOK（ユーザー側で勝手に閉じるため）
        }

        // --- ここからは送信後の処理 ---
        await submitted.deferReply(); // 送信ボタンを押した後なら待機中を出せる

        const newMeaning = submitted.fields.getTextInputValue('meaningInput');
        const newTitlesStr = submitted.fields.getTextInputValue('addTitleInput');
        const messages: string[] = [];

        // 意味の更新
        if (newMeaning !== currentWord.meaning || newImage) {
            const updateData: any = { meaning: newMeaning };
            if (newImage) updateData.imageUrl = newImage.url;

            await prisma.word.update({
                where: { id: currentWord.id },
                data: updateData
            });
            messages.push('✅ 解説文(または画像)を更新しました');
        }

        // 別名の追加
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

        await submitted.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        // モーダル表示前のエラーならreply、後ならeditReplyが必要だが、
        // 複雑になるので簡易的にコンソールのみ
    }
};