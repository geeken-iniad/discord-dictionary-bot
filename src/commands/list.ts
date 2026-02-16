import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    Colors, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    ButtonInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    StringSelectMenuInteraction
} from 'discord.js';
import { prisma } from '../prismaClient';

const ITEMS_PER_PAGE = 10; // 1ページに表示する件数

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();
        const filterTag = interaction.options.getString('tag');

        // 1. データを取得 (タグ絞り込み対応)
        const whereClause = filterTag ? { tag: filterTag } : {};

        // 全件取得してからJS側でページ分けします
        const allWords = await prisma.word.findMany({
            where: whereClause,
            include: { titles: true },
            orderBy: { createdAt: 'desc' }
        });

        // 🌟 既存のタグ一覧を取得 (重複排除)
        const existingTagsRaw = await prisma.word.groupBy({
            by: ['tag'],
            where: { 
                tag: { not: null } 
            }
        });
        
        const existingTags = existingTagsRaw
            .map(t => t.tag)
            .filter((t): t is string => t !== null && t !== '');

        if (allWords.length === 0) {
            const msg = filterTag 
                ? `🏷️ タグ **「${filterTag}」** が付いた単語は見つかりませんでした。`
                : '📭 辞書はまだ空っぽです。`/add` で追加してください！';
            
            await interaction.editReply(msg);
            return;
        }

        // 2. ページネーションの準備
        let currentPage = 0;
        const maxPage = Math.ceil(allWords.length / ITEMS_PER_PAGE) - 1;

        // ▼ 画面（Embedとコンポーネント）を作る関数
        const generateView = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = allWords.slice(start, end);

            // ① Embed作成
            const titleText = filterTag 
                ? `📖 登録単語リスト (タグ: ${filterTag})` 
                : '📖 登録単語リスト';

            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle(titleText)
                .setFooter({ text: `ページ ${page + 1} / ${maxPage + 1} (全 ${allWords.length} 件)` })
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

            const components: ActionRowBuilder<any>[] = [];

            // ② 単語選択メニュー (タグ編集用)
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

            // ③ ページ送りボタン
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
        const response = await interaction.editReply(generateView(currentPage));

        if (allWords.length === 0) return;

        // 4. ボタン操作の監視
        const collector = response.createMessageComponentCollector({ 
            time: 5 * 60 * 1000 
        });

        collector.on('collect', async (i: any) => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '自分のコマンド以外は操作できません', ephemeral: true });
                return;
            }

            // A. ページ送りボタン
            if (i.isButton()) {
                if (i.customId === 'prev') {
                    currentPage = Math.max(0, currentPage - 1);
                } else if (i.customId === 'next') {
                    currentPage = Math.min(maxPage, currentPage + 1);
                }
                await i.update(generateView(currentPage));
                return;
            }

            // B. 単語選択メニュー (タグ編集画面を出す)
            if (i.isStringSelectMenu() && i.customId === 'selectWordForTag') {
                const val = i.values[0];
                if (!val) return; // 🛑 ガード節を追加

                const selectedWordId = parseInt(val);
                const targetWord = allWords.find(w => w.id === selectedWordId);

                if (!targetWord) {
                    await i.reply({ content: '❌ エラー：単語が見つかりません', ephemeral: true });
                    return;
                }

                // タグが一つもない場合の対応
                if (existingTags.length === 0 && !targetWord.tag) {
                    await i.reply({ content: '⚠️ まだタグが一つも作られていません。`/add` か `/update` で新しいタグを作ってください。', ephemeral: true });
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
                    .setCustomId(`applyTag_${selectedWordId}`)
                    .setPlaceholder('付与するタグを選択してください')
                    .addOptions(tagOptions);

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tagSelectMenu);

                await i.reply({ 
                    content: `**「${targetWord.titles[0]?.text}」** のタグを編集します`, 
                    components: [row], 
                    ephemeral: true
                });
            }

            // C. タグ適用処理
            if (i.isStringSelectMenu() && i.customId.startsWith('applyTag_')) {
                const wordId = parseInt(i.customId.replace('applyTag_', ''));
                const newTagRaw = i.values[0];
                
                // 🛑 ガード節を追加 (ここがエラーの原因でした！)
                if (!newTagRaw) return;

                const newTag = newTagRaw === '__REMOVE_TAG__' ? null : newTagRaw;

                // DB更新
                await prisma.word.update({
                    where: { id: wordId },
                    data: { tag: newTag }
                });

                // メモリ上のデータも更新
                const wordIndex = allWords.findIndex(w => w.id === wordId);
                if (wordIndex !== -1 && allWords[wordIndex]) {
                    allWords[wordIndex]!.tag = newTag;
                }

                await i.update({ 
                    content: `✅ タグを **${newTag || 'なし'}** に変更しました！`, 
                    components: [] 
                });
                
                await interaction.editReply(generateView(currentPage));
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
        await interaction.editReply('❌ エラーが発生しました。');
    }
};