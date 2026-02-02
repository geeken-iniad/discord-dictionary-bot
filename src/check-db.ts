import { PrismaClient } from '@prisma/client';
import { GuildMessageManager } from 'discord.js';
import { globalAgent } from 'node:http';
import { SocketAddress } from 'node:net';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 データベースの中身をチェックします...');
    
    try {
        // Wordテーブルの件数確認
        const count = await prisma.word.count();
        console.log(`📊 データ件数: ${count} 件`);

        if (count > 0) {
            const words = await prisma.word.findMany({ include: { titles: true } });
            console.log('--- 中身リスト ---');
            words.forEach(w => {
                // タイトルがあるか、古いtermがあるか確認
                const titles = w.titles ? w.titles.map(t => t.text).join(', ') : '(タイトルなし)';
                console.log(`ID: ${w.id} | Meaning: ${w.meaning.substring(0, 10)}... | Titles: ${titles}`);
            });
        } else {
            console.log('✅ データは空っぽです！');
        }

    } catch (e) {
        console.error('❌ エラー！DB接続に失敗したか、構造が違います。');
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();

