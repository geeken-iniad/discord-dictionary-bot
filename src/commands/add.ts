import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient';

export const addCommand = async (interaction: ChatInputCommandInteraction) => {
    try {
        await interaction.deferReply();

        // 1. 入力を受け取る (例: "りんご/Apple/アップル")
        const inputWord = interaction.options.getString('word');
        const meaning = interaction.options.getString('meaning');
        const image = interaction.options.getAttachment('image');

        if (!inputWord || !meaning) {
            await interaction.editReply('❌ 単語と意味を入力してください。');
            return;
        }

        // 2. スラッシュで分割して、余計な空白を消す
        // ["りんご", "Apple", " アップル "] -> ["りんご", "Apple", "アップル"]
        const titles = inputWord.split('/').map(t => t.trim()).filter(t => t.length > 0);

        // 3. データベースに保存 (ここが凄いところ！)
        // 「意味(Word)」を作りつつ、同時に「見出し語(Title)」も一気に複数作ります
        await prisma.word.create({
            data: {
                meaning: meaning,
                imageUrl: image ? image.url : null,
                authorName: interaction.user.username,
                // 👇 createManyで一括登録
                titles: {
                    create: titles.map(t => ({ text: t }))
                }
            },
        });

        // 表示用に「/」でつなぎ直す
        const joinedTitle = titles.join(' / ');
        await interaction.editReply(`✅ **「${joinedTitle}」** を登録しました！`);
        
    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ エラー：その単語は既に登録されているかもしれません。');
    }
};