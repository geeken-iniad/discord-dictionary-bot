import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        // 【重要】先に「考え中...」状態にする
        await interaction.deferReply(); 

        // 1. データを全部取得
        const allWords = await prisma.word.findMany();
        if (allWords.length === 0) {
            await interaction.editReply({ content: '📭 辞書はまだ空っぽです。' });
            return;
        }

        // 2. 見やすくカード(Embed)にする
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📖 登録単語リスト')
            .setFooter({ text: `全 ${allWords.length} 件 (最新25件を表示)` }) // 25件以上ある場合のため
            .addFields(
                // 【重要】words ではなく allWords を使います
                // Discordの制限で Field は25個までなので、slice(0, 25) で制限をかけます
                allWords.slice(0, 25).map(word => ({
                    name: word.term,
                    // 名前があれば表示、なければ「不明」と表示
                    value: `${word.meaning}\n*(by ${word.authorName ?? '不明'})*`, 
                    inline: false,
                }))
            );

        // 3. 送信！
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: '❌ 取得中にエラーが発生しました。DBに繋がらないかも？' });
    }
};