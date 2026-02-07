import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    Colors, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType 
} from 'discord.js';
import { prisma } from '../prismaClient';
import { get } from 'fast-levenshtein'; // 👈 インストールしたライブラリ

export const searchCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const keyword = interaction.options.getString('keyword');
        if (!keyword) return;

        // 1. 通常の検索 (完全一致 or 部分一致)
        const matchedTitles = await prisma.title.findMany({
            where: { text: { contains: keyword } },
            include: { word: true }
        });

        // ヒットしたらそのまま表示 (既存のロジック)
        if (matchedTitles.length > 0) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle(`🔎 「${keyword}」の検索結果`)
                .setDescription(`${matchedTitles.length} 件ヒットしました`);

            const displayedWordIds = new Set();
            matchedTitles.slice(0, 5).forEach(title => {
                if (displayedWordIds.has(title.wordId)) return;
                displayedWordIds.add(title.wordId);

                const word = title.word;
                if (!embed.data.image && word.imageUrl) embed.setImage(word.imageUrl);
                if (word.link && !embed.data.url) embed.setURL(word.link); // リンクがあればセット

                embed.addFields({
                    name: `📌 ${title.text}`,
                    value: word.meaning,
                    inline: false,
                });
            });

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // ---------------------------------------------------------
        // 🚀 ここから新機能：「もしかして」ロジック
        // ---------------------------------------------------------

        // 2. 全てのタイトルを取得して比較する
        const allTitles = await prisma.title.findMany();
        
        // 3. レーベンシュタイン距離を計算し、近い順に並べる
        const candidates = allTitles
            .map(t => {
                // 入力された文字(keyword)と、DBの単語(t.text)の距離を計算
                // 大文字小文字は無視して比較するのがコツ！
                const distance = get(keyword.toLowerCase(), t.text.toLowerCase());
                return { ...t, distance };
            })
            .filter(t => t.distance <= 3) // 👈 「距離3以内」のものだけ残す (数字は調整可)
            .sort((a, b) => a.distance - b.distance) // 距離が近い順に並び替え
            .slice(0, 3); // トップ3だけ採用

        // 似ている単語すらなければ終了
        if (candidates.length === 0) {
            await interaction.editReply(`❌ **「${keyword}」** に一致する単語は見つかりませんでした。`);
            return;
        }

        // 4. 「もしかしてボタン」を作る
        const row = new ActionRowBuilder<ButtonBuilder>();
        
        candidates.forEach(c => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`fuzzy_${c.wordId}`) // IDをボタンに埋め込む
                    .setLabel(`${c.text} ?`) // ボタンの文字
                    .setStyle(ButtonStyle.Primary)
            );
        });

        const suggestionEmbed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle('🤔 お探しの単語は見つかりませんでしたが...')
            .setDescription(`もしかして、以下の単語のことですか？\nボタンを押すと解説を表示します。`);

        const response = await interaction.editReply({ 
            embeds: [suggestionEmbed], 
            components: [row] 
        });

        // 5. ボタンが押されたら解説を表示する (制限時間30秒)
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 30000 
        });

        collector.on('collect', async (i) => {
            // どのボタンが押されたか (fuzzy_123 から 123 を取り出す)
            const wordId = parseInt(i.customId.replace('fuzzy_', ''));
            
            // その単語のデータを取得
            const word = await prisma.word.findUnique({
                where: { id: wordId },
                include: { titles: true }
            });

            if (!word) {
                await i.reply({ content: '❌ エラー：データが見つかりません', ephemeral: true });
                return;
            }

            // 解説を表示
            const titleText = word.titles.map(t => t.text).join(' / ');
            const resultEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(`📚 ${titleText} の解説`) // ここが正解のタイトル
                .setDescription(word.meaning);

            if (word.imageUrl) resultEmbed.setImage(word.imageUrl);
            if (word.link) resultEmbed.setURL(word.link);

            // ボタンを押した人だけにこっそり見せるなら ephemeral: true
            // 全員に見せるなら ephemeral: false
            await i.reply({ embeds: [resultEmbed], ephemeral: true });
        });

        // 時間切れになったらボタンを無効化（グレーアウト）する処理
        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder<ButtonBuilder>();
            candidates.forEach(c => {
                disabledRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`fuzzy_${c.wordId}`)
                        .setLabel(c.text)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
            });
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};