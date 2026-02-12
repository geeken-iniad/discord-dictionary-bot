import { 
    ContextMenuCommandInteraction, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    ApplicationCommandType,
    EmbedBuilder,
    Colors 
} from 'discord.js';
import { prisma } from '../prismaClient';

export const contextAddCommand = async (interaction: ContextMenuCommandInteraction) => {
    // Message Context Menu 以外なら無視
    if (!interaction.isMessageContextMenuCommand()) return;

    const targetMessage = interaction.targetMessage;
    
    // メッセージの内容を取得 (空なら空文字)
    const initialMeaning = targetMessage.content || '';
    // メッセージに画像があれば、そのURLを取得 (最初の1枚)
    const initialImage = targetMessage.attachments.first()?.url || '';

    // 1. モーダル作成
    const modal = new ModalBuilder()
        .setCustomId('contextAddModal')
        .setTitle('📖 辞書に登録');

    // 2. 入力欄を作る
    // ① 単語 (これはユーザーに入力してもらう)
    const wordInput = new TextInputBuilder()
        .setCustomId('wordInput')
        .setLabel("単語名")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('登録したい単語を入力してください')
        .setRequired(true);

    // ② 意味 (メッセージの内容を最初から入れておく！)
    const meaningInput = new TextInputBuilder()
        .setCustomId('meaningInput')
        .setLabel("意味")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(initialMeaning.substring(0, 4000)) // 長すぎるとエラーになるのでカット
        .setRequired(true);

    // ③ リンク (画像URLがあれば入れておく、なければ空)
    const linkInput = new TextInputBuilder()
        .setCustomId('linkInput')
        .setLabel("参考リンク / 画像URL")
        .setStyle(TextInputStyle.Short)
        .setValue(initialImage) 
        .setRequired(false);

    // ④ タグ
    const tagInput = new TextInputBuilder()
        .setCustomId('tagInput')
        .setLabel("タグ (例: 技術, 内輪ネタ)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(wordInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput)
    );

    // 3. フォームを表示
    await interaction.showModal(modal);

    // 4. 送信待ち (制限時間: 5分)
    const submitted = await interaction.awaitModalSubmit({
        time: 5 * 60 * 1000,
        filter: (i) => i.customId === 'contextAddModal'
    }).catch(() => null);

    if (!submitted) return; // タイムアウトやキャンセルの場合

    try {
        await submitted.deferReply();

        // 入力値の取得
        const word = submitted.fields.getTextInputValue('wordInput');
        const meaning = submitted.fields.getTextInputValue('meaningInput');
        const link = submitted.fields.getTextInputValue('linkInput');
        const tag = submitted.fields.getTextInputValue('tagInput');

        // DBに保存
        // (スラッシュ区切りで複数の別名も登録できるようにする)
        const titles = word.split('/').map(t => t.trim()).filter(t => t.length > 0);

        const newWord = await prisma.word.create({
            data: {
                meaning: meaning,
                link: link || null,
                tag: tag || null,
                // もしリンクが画像URLっぽかったらimageUrlにも入れる小技
                imageUrl: (link && link.match(/\.(jpeg|jpg|gif|png)$/) != null) ? link : null,
                authorName: interaction.user.username,
                titles: {
                    create: titles.map(t => ({ text: t }))
                }
            }
        });

        // 完了メッセージ
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`✅ 登録完了: ${titles.join(' / ')}`)
            .setDescription(meaning)
            .setFooter({ text: `登録者: ${interaction.user.username}` });

        if (newWord.imageUrl) embed.setImage(newWord.imageUrl);
        if (tag) embed.addFields({ name: '🏷️ タグ', value: tag });

        await submitted.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await submitted.editReply('❌ エラーが発生しました。');
    }
};