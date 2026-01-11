import { ChatInputCommandInteraction, EmbedBuilder, Colors, Message, TextChannel } from 'discord.js';
import { prisma } from '../prismaClient';

export const quizCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply(); // 考え中...

        // 🎲 1. ランダムに1単語を取り出す技
        // (Prismaには random() がないので、「全件数」を数えて、「適当な数だけスキップ」して取ります)
        const count = await prisma.word.count();
        
        if (count === 0) {
            await interaction.editReply('❌ まだ単語が登録されていません。まずは /add してください！');
            return;
        }

        const randomIndex = Math.floor(Math.random() * count);
        const [word] = await prisma.word.findMany({
            take: 1,
            skip: randomIndex,
        });

        if (!word) {
            await interaction.editReply('❌ 単語の取得に失敗しました。もう一度試してね。');
            return;
        }
        // 2. 問題を出題！
        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('🧠 クイズ！この意味はなーんだ？')
            .setDescription(`**意味:**\n${word.meaning}`)
            .setFooter({ text: '15秒以内に単語をチャットで答えてね！' });

        await interaction.editReply({ embeds: [embed] });

        // 👂 3. 答えを待ち構える「コレクター」を設置
        // filter: 「クイズを始めた本人」の「新しいメッセージ」だけを通すフィルター
        const filter = (m: Message) => m.author.id === interaction.user.id;
        
        const channel = interaction.channel as TextChannel;

        if (!channel) {
            await interaction.editReply('❌ チャンネル情報が取得できませんでした。');
            return;
        }

        // interaction.channel ではなく、今定義した channel を使う
        const collector = channel.createMessageCollector({ 
            filter, 
            time: 15000, 
            max: 1 
        });
        if (!collector) return;

        // 何か発言があった時の処理
        collector.on('collect', async (m: Message) => {
            if (m.content.trim() === word.term) {
                // 正解！
                await m.reply(`🎉 **正解です！** お見事！`);
                await m.react('⭕');
            } else {
                // 不正解...
                await m.reply(`😢 **残念...** 正解は **「${word.term}」** でした！`);
                await m.react('❌');
            }
        });

        // 時間切れの時の処理
        collector.on('end', (collected) => {
            if (collected.size === 0) {
                interaction.followUp(`⏰ **時間切れ！** 正解は **「${word.term}」** でした。`);
            }
        });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ クイズの準備中にエラーが発生しました。');
    }
};