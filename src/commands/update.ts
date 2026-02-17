import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    MessageFlags,
    InteractionReplyOptions,
    StringSelectMenuInteraction,
    ModalSubmitInteraction
} from 'discord.js';
import { prisma } from '../prismaClient';

// コマンド定義
export const data = new SlashCommandBuilder()
    .setName('update')
    .setDescription('単語の情報を更新します')
    .addSubcommand(sub => 
        sub.setName('word')
           .setDescription('特定の単語の詳細（意味やリンクなど）を更新します')
           .addStringOption(option => option.setName('word').setDescription('更新する単語').setRequired(true))
    )
    .addSubcommand(sub => 
        sub.setName('tags')
           .setDescription('複数の単語のタグを一括で変更します')
           .addStringOption(option => option.setName('keyword').setDescription('対象を検索するキーワード（空欄なら最新25件を表示）'))
    );

export const updateCommand = async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand(false);

    if (!subcommand) {
        await interaction.reply({ 
            content: '⚠️ コマンドの形式が古いです！Discordを再読み込み(Ctrl+R)してください。', 
            flags: MessageFlags.Ephemeral 
        });
        return;
    }

    if (subcommand === 'word') {
        await handleWordUpdate(interaction);
    } else if (subcommand === 'tags') {
        await handleTagsUpdate(interaction);
    }
};

// ---------------------------------------------------------
// 🅰️ 既存機能：単一単語の更新
// ---------------------------------------------------------
async function handleWordUpdate(interaction: ChatInputCommandInteraction) {
    const wordText = interaction.options.getString('word', true);

    const word = await prisma.word.findFirst({
        where: {
            titles: { some: { text: wordText } }
        },
        include: { titles: true }
    });

    if (!word) {
        await interaction.reply({ content: `❌ 単語 **「${wordText}」** が見つかりませんでした。`, flags: MessageFlags.Ephemeral });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`updateWordModal_${word.id}`)
        .setTitle(`編集: ${word.titles[0]?.text || '詳細'}`);

    const meaningInput = new TextInputBuilder()
        .setCustomId('meaningInput')
        .setLabel('意味')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(word.meaning)
        .setRequired(true);

    const linkInput = new TextInputBuilder()
        .setCustomId('linkInput')
        .setLabel('参考リンク (任意)')
        .setStyle(TextInputStyle.Short)
        .setValue(word.link || '')
        .setRequired(false);

    const tagInput = new TextInputBuilder()
        .setCustomId('tagInput')
        .setLabel('タグ (任意)')
        .setStyle(TextInputStyle.Short)
        .setValue(word.tag || '')
        .setRequired(false);

    const aliasInput = new TextInputBuilder()
        .setCustomId('aliasInput')
        .setLabel('別名を追加 (任意・カンマ区切り)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例: JS, Java Script')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(meaningInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(aliasInput)
    );

    await interaction.showModal(modal);

    try {
        const submitted = await interaction.awaitModalSubmit({
            time: 10 * 60 * 1000,
            filter: i => i.customId === `updateWordModal_${word.id}` && i.user.id === interaction.user.id
        });

        const newMeaning = submitted.fields.getTextInputValue('meaningInput');
        const newLink = submitted.fields.getTextInputValue('linkInput') || null;
        const newTag = submitted.fields.getTextInputValue('tagInput') || null;
        const newAliasRaw = submitted.fields.getTextInputValue('aliasInput');

        await prisma.word.update({
            where: { id: word.id },
            data: {
                meaning: newMeaning,
                link: newLink,
                tag: newTag
            }
        });

        if (newAliasRaw.trim()) {
            const aliases = newAliasRaw.split(/[,、]/).map(s => s.trim()).filter(s => s);
            for (const alias of aliases) {
                const exists = await prisma.title.findFirst({ where: { text: alias } });
                if (!exists) {
                    await prisma.title.create({
                        data: {
                            text: alias,
                            wordId: word.id
                        }
                    });
                }
            }
        }

        await submitted.reply({ content: `✅ **「${word.titles[0]?.text}」** の情報を更新しました！` });

    } catch (error) {
        // time out
    }
}

// ---------------------------------------------------------
// 🅱️ 新機能：タグの一括更新
// ---------------------------------------------------------
async function handleTagsUpdate(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const keyword = interaction.options.getString('keyword') || '';
        
        const targets = await prisma.word.findMany({
            where: keyword ? {
                titles: { some: { text: { contains: keyword } } }
            } : {},
            include: { titles: true },
            orderBy: { updatedAt: 'desc' }, // 👈 schema更新でこれが動くようになります
            take: 25 
        });

        if (targets.length === 0) {
            await interaction.editReply(`❌ キーワード **「${keyword}」** に一致する単語は見つかりませんでした。`);
            return;
        }

        const wordSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('batch_word_select')
            .setPlaceholder('タグを変更したい単語を選択 (複数可)')
            .setMinValues(1)
            .setMaxValues(targets.length)
            .addOptions(
                targets.map(w => new StringSelectMenuOptionBuilder()
                    .setLabel(w.titles[0]?.text.substring(0, 100) || '無題')
                    .setDescription(`現在のタグ: ${w.tag || 'なし'}`)
                    .setValue(w.id.toString())
                )
            );

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(wordSelectMenu);

        const message = await interaction.editReply({
            content: `🔍 **${targets.length}件** 見つかりました。\nタグを一括変更したい単語を選んでください。`,
            components: [row1]
        });

        const selection = await message.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 60_000,
        }) as StringSelectMenuInteraction;

        const selectedWordIds = selection.values.map(v => parseInt(v));

        const existingTagsRaw = await prisma.word.groupBy({
            by: ['tag'],
            where: { tag: { not: null } }
        });
        const existingTags = existingTagsRaw.map(t => t.tag).filter((t): t is string => !!t);

        const tagSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('batch_tag_select')
            .setPlaceholder('付与するタグを選択...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('❌ タグを削除').setValue('__REMOVE__').setDescription('選択した単語のタグを外します'),
                new StringSelectMenuOptionBuilder().setLabel('✨ 新しいタグを手入力').setValue('__NEW__').setDescription('新しいタグを作成して付与します'),
                ...existingTags.slice(0, 23).map(t => 
                    new StringSelectMenuOptionBuilder().setLabel(t).setValue(t)
                )
            );

        const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tagSelectMenu);

        const tagSelectionResponse = await selection.reply({
            content: `✅ **${selectedWordIds.length}件** 選択しました。\nこれらに設定するタグを選んでください。`,
            components: [row2],
            flags: MessageFlags.Ephemeral,
            fetchReply: true
        });

        const tagSelection = await tagSelectionResponse.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 60_000,
        }) as StringSelectMenuInteraction;

        let finalTag: string | null = null;
        
        // 🛑 ここを修正: undefined チェックを追加して型エラーを回避
        const selectedVal = tagSelection.values[0];
        if (!selectedVal) return; 

        // A. 新しいタグの手入力の場合
        if (selectedVal === '__NEW__') {
            const modal = new ModalBuilder()
                .setCustomId('new_tag_modal')
                .setTitle('新しいタグを作成');
            const input = new TextInputBuilder()
                .setCustomId('new_tag_input')
                .setLabel('タグ名')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

            await tagSelection.showModal(modal);

            const modalSubmit = await tagSelection.awaitModalSubmit({
                time: 5 * 60 * 1000,
                filter: i => i.user.id === interaction.user.id
            });
            
            finalTag = modalSubmit.fields.getTextInputValue('new_tag_input');
            await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

            await prisma.word.updateMany({
                where: { id: { in: selectedWordIds } },
                data: { tag: finalTag }
            });

            await modalSubmit.editReply(`🎉 **${selectedWordIds.length}件** のタグを **「${finalTag}」** に一括更新しました！`);
            return;
        } 
        
        // B. 既存タグまたは削除の場合
        else {
            if (selectedVal === '__REMOVE__') {
                finalTag = null;
            } else {
                finalTag = selectedVal;
            }

            await tagSelection.deferUpdate();

            await prisma.word.updateMany({
                where: { id: { in: selectedWordIds } },
                data: { tag: finalTag }
            });

            await tagSelection.editReply({
                content: `🎉 **${selectedWordIds.length}件** のタグを **「${finalTag || 'なし'}」** に一括更新しました！`,
                components: [] 
            });
        }

    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: '❌ 時間切れかエラーが発生しました。', components: [] }).catch(() => {});
        }
    }
}