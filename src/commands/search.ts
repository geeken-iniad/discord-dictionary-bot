import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const searchCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply(); // 考え中...

        // 1. ユーザーが入力したキーワードを受け取る
        // (deploy-commands.ts で 'keyword' という名前に設定します)
        const keyword = interaction.options.getString('keyword');

        if (!keyword) {
            await interaction.editReply('❌ キーワードを入力してください。');
            return;
        }

        // 2. データベースから検索！ (ここが重要ポイント✨)
        const results = await prisma.word.findMany({
            where: {
                term: {
                    contains: keyword, // 「この文字を含んでいる」ものを探す
                },
            },
        });

        // 3. 結果が0件だった場合の処理
        if (results.length === 0) {
            await interaction.editReply(`🔎 **「${keyword}」** に一致する単語は見つかりませんでした。`);
            return;
        }

        // 4. 見つかった結果を表示
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange) // 検索結果はオレンジ色にしてみる
            .setTitle(`🔎 「${keyword}」の検索結果`)
            .setDescription(`${results.length} 件見つかりました！`)
            .addFields(
                results.map(word => ({
                    name: word.term,
                    // せっかくなので前回作った登録者名も表示しましょう
                    value: `${word.meaning}\n*(by ${word.authorName ?? '不明'})*`,
                    inline: false,
                }))
            );

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 検索中にエラーが発生しました。');
    }
};