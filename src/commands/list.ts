import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    Colors, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    ButtonInteraction
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
        // (Prismaでページングすることもできますが、タグ絞り込みとの兼ね合いでこの方が実装が楽です)
        const allWords = await prisma.word.findMany({
            where: whereClause,
            include: { titles: true },
            orderBy: { createdAt: 'desc' }
        });

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

        // Embedを作る関数
        const generateEmbed = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = allWords.slice(start, end);

            const titleText = filterTag 
                ? `📖 登録単語リスト (タグ: ${filterTag})` 
                : '📖 登録単語リスト';

            return new EmbedBuilder()
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
        };

        // ボタンを作る関数
        const generateButtons = (page: number) => {
            const row = new ActionRowBuilder<ButtonBuilder>();

            const prevButton = new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀ 前へ')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0); // 最初のページなら押せない

            const nextButton = new ButtonBuilder()
                .setCustomId('next')
                .setLabel('次へ ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === maxPage); // 最後のページなら押せない

            row.addComponents(prevButton, nextButton);
            return row;
        };

        // 3. 初回表示
        const embed = generateEmbed(currentPage);
        const components = maxPage > 0 ? [generateButtons(currentPage)] : []; // 1ページしかなければボタンなし

        const response = await interaction.editReply({ 
            embeds: [embed], 
            components: components 
        });

        // ページが1つしかないならここで終わり
        if (maxPage === 0) return;

        // 4. ボタン操作の監視 (制限時間: 5分)
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 5 * 60 * 1000 
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            // コマンドを実行した本人以外は操作できないようにする
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '自分のコマンド以外は操作できません', ephemeral: true });
                return;
            }

            if (i.customId === 'prev') {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === 'next') {
                currentPage = Math.min(maxPage, currentPage + 1);
            }

            // 更新処理
            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: [generateButtons(currentPage)]
            });
        });

        // 時間切れになったらボタンを無効化
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