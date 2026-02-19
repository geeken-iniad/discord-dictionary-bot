import { ChatInputCommandInteraction,SlashCommandBuilder, EmbedBuilder, Colors, Message, TextChannel } from 'discord.js';
import { prisma } from '../prismaClient';

export const data =     new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('登録された単語からクイズを出します');

export const quizCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        const count = await prisma.word.count();
        if (count === 0) {
            await interaction.editReply('❌ まだ単語が登録されていません。');
            return;
        }

        const randomIndex = Math.floor(Math.random() * count);
        const [word] = await prisma.word.findMany({
            take: 1,
            skip: randomIndex,
            include: { titles: true }
        });

        if (!word) {
            await interaction.editReply('❌ 取得エラー。');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('🧠 クイズ！この意味はなーんだ？')
            .setDescription(`**意味:**\n${word.meaning}`)
            .setFooter({ text: '15秒以内に単語をチャットで答えてね！' });
        
        if (word.imageUrl) embed.setImage(word.imageUrl);

        await interaction.editReply({ embeds: [embed] });

        const filter = (m: Message) => m.author.id === interaction.user.id;
        const channel = interaction.channel as TextChannel;
        const collector = channel.createMessageCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async (m: Message) => {
            const isCorrect = word.titles.some(t => t.text === m.content.trim());
            const titleText = word.titles.map(t => t.text).join(' / ');

            if (isCorrect) {
                await m.reply(`🎉 **正解です！** (${titleText})`);
                await m.react('⭕');
            } else {
                await m.reply(`😢 **残念...** 正解は **「${titleText}」** でした！`);
                await m.react('❌');
            }
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                const titleText = word.titles.map(t => t.text).join(' / ');
                interaction.followUp(`⏰ **時間切れ！** 正解は **「${titleText}」** でした。`);
            }
        });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラーが発生しました。');
    }
};