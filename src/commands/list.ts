import { ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { prisma } from '../prismaClient';

export const listCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        // 【重要】先に「考え中...」状態にする (これで3秒ルールを15分まで延長できる)
        await interaction.deferReply(); 

        // 1. データを全部取得 (ここで時間がかかっても落ちなくなる)
        const allWords = await prisma.word.findMany();

        if (allWords.length === 0) {
            // reply ではなく editReply を使う
            await interaction.editReply({ content: '📭 辞書はまだ空っぽです。' });
            return;
        }

        // 2. 表示するテキストを作る
        const listText = allWords
            .map((w) => `**${w.term}**: ${w.meaning}`)
            .join('\n');

        // 3. 見やすくカード(Embed)にする
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('📖 登録単語リスト')
            .setDescription(listText.substring(0, 4000))
            .setFooter({ text: `全 ${allWords.length} 件` });

        // reply ではなく editReply で上書きする
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        // エラー時も editReply
        await interaction.editReply({ content: '❌ 取得中にエラーが発生しました。DBに繋がらないかも？' });
    }
};