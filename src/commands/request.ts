import { 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    Colors, 
    TextChannel 
} from 'discord.js';

export const requestCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply({ ephemeral: true }); // 他の人に見えないようにする

        const word = interaction.options.getString('word');
        const comment = interaction.options.getString('comment') || 'なし';
        
        // .env からチャンネルIDを取得
        const channelId = process.env.REQUEST_CHANNEL_ID;

        if (!channelId) {
            await interaction.editReply('❌ エラー: 運営用チャンネルが設定されていません。');
            return;
        }

        // Botが知っているチャンネルの中から、そのIDのチャンネルを探す
        const targetChannel = interaction.client.channels.cache.get(channelId) as TextChannel;

        if (!targetChannel) {
            await interaction.editReply('❌ エラー: 運営用チャンネルが見つかりません。Botがそのチャンネルを見れるか確認してください。');
            return;
        }

        // 1. 運営チャンネルに通知カードを送る
        const adminEmbed = new EmbedBuilder()
            .setColor(Colors.Purple)
            .setTitle('📩 新着リクエスト受信！')
            .addFields(
                { name: '希望単語', value: `**${word}**`, inline: true },
                { name: 'リクエスト者', value: `${interaction.user.username}`, inline: true },
                { name: 'コメント', value: comment, inline: false }
            )
            .setTimestamp();

        await targetChannel.send({ embeds: [adminEmbed] });

        // 2. ユーザーにお礼を言う
        await interaction.editReply(`✅ **「${word}」** のリクエストを運営に送信しました！\n反映されるまでしばらくお待ちください。`);

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 送信中にエラーが発生しました。');
    }
};