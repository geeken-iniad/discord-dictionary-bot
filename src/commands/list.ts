import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    Colors, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    InteractionReplyOptions, 
    MessageFlags,
    ComponentType,
    StringSelectMenuInteraction // 👈 追加！
} from 'discord.js';
import { prisma } from '../prismaClient';

const ITEMS_PER_PAGE = 10; 

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();
        const filterTag = interaction.options.getString('tag');
        const whereClause = filterTag ? { tag: filterTag } : {};

        // 1. 総数を取得
        const totalCount = await prisma.word.count({ where: whereClause });
        const maxPage = Math.max(0, Math.ceil(totalCount / ITEMS_PER_PAGE) - 1);

        // 2. タグ一覧を取得
        const existingTagsRaw = await prisma.word.groupBy({
            by: ['tag'],
            where: { tag: { not: null } }
        });
        const existingTags = existingTagsRaw
            .map(t => t.tag)
            .filter((t): t is string => t !== null && t !== '');

        // ▼ データ取得関数
        const fetchPageData = async (page: number) => {
            return await prisma.word.findMany({
                where: whereClause,
                include: { titles: true },
                orderBy: { createdAt: 'desc' },
                skip: page * ITEMS_PER_PAGE, 
                take: ITEMS_PER_PAGE
            });
        };

        // ▼ 画面生成関数
        const generateView = async (page: number) => {
            const currentItems = await fetchPageData(page);

            const titleText = filterTag 
                ? `📖 登録単語リスト (タグ: ${filterTag})` 
                : '📖 登録単語リスト';

            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle(titleText)
                .setFooter({ text: `ページ ${page + 1} / ${maxPage + 1} (全 ${totalCount} 件)` })
                .addFields(
                    currentItems.map(word => {
                        const titleText = word.titles.map(t => t.text).join(' / ');
                        const shortMeaning = word.meaning.length > 50 
                            ? word.meaning.substring(0, 50) + '...' 
                            : word.meaning;
                        const authorInfo = word.authorName ? `by ${word.authorName}` : '不明';
                        const tagInfo = word.tag ? ` | 🏷️ ${word.tag}` : '';

                        return {
                            name: titleText,
                            value: `${shortMeaning}\n*(${authorInfo}${tagInfo})*`, 
                            inline: false,
                        };
                    })
                );

            if (currentItems.length === 0 && totalCount === 0) {
                embed.setDescription('データが見つかりませんでした。');
                return { embeds: [embed], components: [] };
            }

            const components: ActionRowBuilder<any>[] = [];

            // ① 単語選択メニュー
            if (currentItems.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('selectWordForTag')
                    .setPlaceholder('🏷️ タグを編集する単語を選択...')
                    .addOptions(
                        currentItems.map(word => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(word.titles[0]?.text.substring(0, 100) || '無題')
                                .setDescription(`現在のタグ: ${word.tag || 'なし'}`)
                                .setValue(word.id.toString())
                        )
                    );
                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            // ② ページ送りボタン
            if (maxPage > 0) {
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀ 前へ')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('次へ ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === maxPage);

                components.push(new ActionRowBuilder().addComponents(prevButton, nextButton));
            }

            return { embeds: [embed], components };
        };

        // 3. 初回表示
        let currentPage = 0;
        const initialView = await generateView(currentPage);
        const response = await interaction.editReply(initialView);

        if (totalCount === 0) return;

        // 4. イベント監視
        const collector = response.createMessageComponentCollector({ 
            time: 5 * 60 * 1000 
        });

        collector.on('collect', async (i: any) => {
            try {
                if (i.user.id !== interaction.user.id) {
                    const reply: InteractionReplyOptions = { content: '自分のコマンド以外は操作できません', flags: MessageFlags.Ephemeral };
                    await i.reply(reply);
                    return;
                }

                // A. ページ送りボタン
                if (i.isButton()) {
                    await i.deferUpdate(); 
                    if (i.customId === 'prev') currentPage = Math.max(0, currentPage - 1);
                    if (i.customId === 'next') currentPage = Math.min(maxPage, currentPage + 1);
                    await i.editReply(await generateView(currentPage));
                    return;
                }

                // B. 単語選択メニュー (タグ編集画面を出す)
                if (i.isStringSelectMenu() && i.customId === 'selectWordForTag') {
                    const val = i.values[0];
                    if (!val) return; 
                    const selectedWordId = parseInt(val);

                    const targetWord = await prisma.word.findUnique({
                        where: { id: selectedWordId },
                        include: { titles: true }
                    });

                    if (!targetWord) {
                        const reply: InteractionReplyOptions = { content: '❌ エラー：単語が見つかりません', flags: MessageFlags.Ephemeral };
                        await i.reply(reply);
                        return;
                    }

                    const tagOptions = existingTags.slice(0, 24).map(tag => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(tag)
                            .setValue(tag)
                            .setDefault(targetWord.tag === tag)
                    );

                    tagOptions.unshift(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('❌ タグを削除 (未設定にする)')
                            .setValue('__REMOVE_TAG__')
                            .setDescription('タグを外します')
                    );

                    const tagSelectMenu = new StringSelectMenuBuilder()
                        .setCustomId('applyTagSelect')
                        .setPlaceholder('付与するタグを選択してください')
                        .addOptions(tagOptions);

                    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tagSelectMenu);

                    const popupMessage = await i.reply({ 
                        content: `**「${targetWord.titles[0]?.text}」** のタグを編集します`, 
                        components: [row], 
                        flags: MessageFlags.Ephemeral,
                        fetchReply: true 
                    });

                    // 👇 ここを修正しました！ (subI に型を付けました)
                    try {
                        const selection = await popupMessage.awaitMessageComponent({
                            componentType: ComponentType.StringSelect,
                            time: 60_000,
                            filter: (subI: StringSelectMenuInteraction) => subI.user.id === i.user.id
                        });

                        await selection.deferUpdate(); 

                        const newTagRaw = selection.values[0];
                        const newTag = (!newTagRaw || newTagRaw === '__REMOVE_TAG__') ? null : newTagRaw;

                        await prisma.word.update({
                            where: { id: selectedWordId },
                            data: { tag: newTag }
                        });

                        await selection.editReply({ 
                            content: `✅ タグを **${newTag || 'なし'}** に変更しました！`, 
                            components: [] 
                        });
                        
                        await interaction.editReply(await generateView(currentPage));

                    } catch (e) {
                        await i.editReply({ content: '❌ 時間切れです', components: [] });
                    }
                }

            } catch (e) {
                console.error('List Interaction Error:', e);
                if (!i.replied && !i.deferred) {
                    const reply: InteractionReplyOptions = { content: '❌ エラーが発生しました。', flags: MessageFlags.Ephemeral };
                    await i.reply(reply).catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('◀ 前へ').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId('next').setLabel('次へ ▶').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });

    } catch (error) {
        console.error(error);
        const reply: InteractionReplyOptions = { content: '❌ エラーが発生しました。', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ エラーが発生しました。' });
        } else {
            await interaction.reply(reply);
        }
    }
};