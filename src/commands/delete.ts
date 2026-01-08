import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../prismaClient'; 

export const deleteCommand = async (interaction: ChatInputCommandInteraction) => {
        const word = interaction.options.getString('word');
        
        if (word) {
            try {
                // DBから削除
                await prisma.word.delete({
                    where: { term: word } // term(単語)が一致するものを探して消す
                });

                await interaction.reply({ 
                    content: `🗑️ **「${word}」** を辞書から削除しました。`, 
                    ephemeral: true 
                });
                console.log(`DB削除: ${word}`);

            } catch (error) {
                // 存在しない単語を消そうとした時のエラー対応
                await interaction.reply({ 
                    content: `❌ エラー: 「${word}」という単語は見つかりませんでした。`, 
                    ephemeral: true 
                });
            }
        }};