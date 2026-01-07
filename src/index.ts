import { Client, GatewayIntentBits, Events } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // これがないと中身を読めません
    ],
});

// 1. 解説したい単語リスト（辞書）を作る
// ゆくゆくはこれをデータベース(PostgreSQL)に置き換えます
const dictionary: { [key: string]: string } = {
    '非同期処理': '処理が終わるのを待たずに、次の処理に進むことだよ。時間の節約になるね！',
    'API': 'Application Programming Interfaceの略。ソフトウェア同士が会話するための窓口のことだよ。',
    'デプロイ': '開発したプログラムをサーバーに置いて、みんなが使える状態にすることだよ。',
    'スタック': 'データ構造の一つで、積み上げ方式のこと。または技術の組み合わせ（技術スタック）を指すこともあるよ。',
};

client.once(Events.ClientReady, (c) => {
    console.log(`準備OK！ ${c.user.tag} として辞書機能が起動しました。`);
});

client.on(Events.MessageCreate, async (message) => {
    // Bot自身の発言には反応しない
    if (message.author.bot) return;

    // 2. メッセージの中に「辞書にある単語」が含まれているかチェック
    // Object.keys(dictionary) は ['非同期処理', 'API', ...] というリストになります
    for (const word of Object.keys(dictionary)) {
        
        if (message.content.includes(word)) {
            try {
                // 3. ヒットしたらスレッドを作成 (ここが非同期処理！)
                const thread = await message.startThread({
                    name: `解説: ${word}`, // スレッドのタイトル
                    autoArchiveDuration: 60, // 1時間で自動的に閉じる
                });

                // 4. 作ったスレッドの中に解説を書き込む
                await thread.send(`**【${word}】**\n${dictionary[word]}`);
                
                console.log(`「${word}」の解説スレッドを作成しました`);
                
                // 1つのメッセージで複数の単語に反応しすぎないよう、1個見つけたら終了
                return; 

            } catch (error) {
                console.error('スレッド作成エラー:', error);
                // 権限がない場合などにエラーが出ます
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);