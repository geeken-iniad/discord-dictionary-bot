import { prisma } from "../prismaClient";

// 末尾のカテゴリ補足を削除
function normalizeTerm(title: string): string {
  return title
    .replace(/\s*\([^)]*\)$/u, "") // 末尾の全括弧を削除
    .trim();
}

async function main() {
  try {
    console.log("🧹 Wiki辞書のクリーンアップを開始します...");

    // 1. すべてのwikiWordを取得
    const allWords = await prisma.wikiWord.findMany({
      orderBy: { updatedAt: "desc" },
    });

    console.log(`📊 対象レコード数: ${allWords.length}`);

    // 2. 括弧を削除したtermでグループ化
    const groupedByNormalized = new Map<string, typeof allWords>();

    for (const word of allWords) {
      const normalized = normalizeTerm(word.term);
      if (!groupedByNormalized.has(normalized)) {
        groupedByNormalized.set(normalized, []);
      }
      groupedByNormalized.get(normalized)!.push(word);
    }

    console.log(`📈 正規化後の一意なterm数: ${groupedByNormalized.size}`);

    let duplicatesDeleted = 0;
    let bracketsCleaned = 0;

    // 3. 重複と括弧を処理
    for (const [normalized, words] of groupedByNormalized) {
      if (words.length > 1) {
        // 重複が存在
        console.log(`\n⚠️  重複検出: "${normalized}" (${words.length}件)`);

        // 最新のレコード（updatedAt最新）を保持し、古いものを削除
        const newest = words[0]!;
        const older = words.slice(1);

        console.log(`  保持: ID ${newest.id} - "${newest.term}"`);

        for (const oldWord of older) {
          console.log(`  削除: ID ${oldWord.id} - "${oldWord.term}" (重複)`);
          await prisma.wikiWord.delete({
            where: { id: oldWord.id },
          });
          duplicatesDeleted++;
        }

        // 保持されるレコードの括弧を削除
        if (newest.term !== normalized) {
          console.log(`  括弧削除: "${newest.term}" → "${normalized}"`);
          await prisma.wikiWord.update({
            where: { id: newest.id },
            data: { term: normalized },
          });
          bracketsCleaned++;
        }
      } else {
        // 重複なし。括弧を削除するだけ
        const word = words[0]!;
        if (word.term !== normalized) {
          console.log(`✂️  括弧削除: "${word.term}" → "${normalized}"`);
          await prisma.wikiWord.update({
            where: { id: word.id },
            data: { term: normalized },
          });
          bracketsCleaned++;
        }
      }
    }

    console.log(`\n✨ クリーンアップ完了！`);
    console.log(`  削除した重複: ${duplicatesDeleted} 件`);
    console.log(`  括弧を削除したterm: ${bracketsCleaned} 件`);

    const finalCount = await prisma.wikiWord.count();
    console.log(`  最終レコード数: ${finalCount} 件`);
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
