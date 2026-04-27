import { prisma } from "../prismaClient";

// 正規表現の特殊文字をエスケープ
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 説明文をクリーニング
function cleanMeaning(meaning: string, term: string): string {
  // 1. 先頭の「タイトル + (読み) + は/とは」などの説明導入を除去
  const escapedTerm = escapeRegExp(term);
  const leadPatterns = [
    new RegExp(
      `^${escapedTerm}\\s*(?:（[^）]*）|\\([^)]*\\))?\\s*(?:とは|は|である|です|を指す|をいう|を意味する)?\\s*`,
      "u",
    ),
    new RegExp(`^${escapedTerm}\\s*`, "u"),
  ];

  let cleaned = meaning;
  for (const pattern of leadPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // 2. 先頭に残った句読点・記号を除去
  cleaned = cleaned.replace(/^[、，,。．・:：;；\-ー\s]+/u, "");

  // 3. 空白の正規化
  cleaned = cleaned.replace(/[ \t\r\n]+/g, " ").trim();

  // 4. 英字先頭のみ先頭大文字に統一
  if (cleaned.length > 0 && /^[a-z]/u.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // 5. 長すぎる説明は先頭文優先で短縮
  if (cleaned.length > 240) {
    const firstPeriod = cleaned.indexOf("。");
    if (firstPeriod > 30 && firstPeriod < 240) {
      cleaned = cleaned.slice(0, firstPeriod + 1);
    } else {
      cleaned = `${cleaned.slice(0, 240)}...`;
    }
  }

  // 6. 句読点だけになった場合は元文に戻す
  if (/^[、，,。．・\s]+$/u.test(cleaned)) {
    return meaning.trim();
  }

  // 7. クリーニング結果が空なら元文を返す
  return cleaned.length > 0 ? cleaned : meaning.trim();
}

async function main() {
  try {
    console.log("🧹 Wiki辞書の説明文をクリーニングしています...");

    const force = process.argv.includes("--force");

    // 通常は processed=false のみ、--force なら全件再処理
    const unprocessedWords = force
      ? await prisma.wikiWord.findMany({
          orderBy: { id: "asc" },
        })
      : await prisma.wikiWord.findMany({
          where: { processed: false },
          orderBy: { id: "asc" },
        });

    console.log(
      `📊 処理対象レコード数: ${unprocessedWords.length} (force: ${force})`,
    );

    let processedCount = 0;
    let cleanedCount = 0;

    for (const word of unprocessedWords) {
      try {
        const originalMeaning = word.meaning;
        const cleanedMeaning = cleanMeaning(word.meaning, word.term);

        if (originalMeaning !== cleanedMeaning) {
          console.log(`\n✏️  "${word.term}"`);
          console.log(
            `   元: ${originalMeaning.substring(0, 80)}${originalMeaning.length > 80 ? "..." : ""}`,
          );
          console.log(
            `   新: ${cleanedMeaning.substring(0, 80)}${cleanedMeaning.length > 80 ? "..." : ""}`,
          );

          await prisma.wikiWord.update({
            where: { id: word.id },
            data: {
              meaning: cleanedMeaning,
              processed: true,
            },
          });

          cleanedCount++;
        } else if (!word.processed) {
          // 意味に変更がなくても初回のみ processed フラグを更新
          await prisma.wikiWord.update({
            where: { id: word.id },
            data: { processed: true },
          });
        }

        processedCount++;

        // 進捗表示
        if (processedCount % 50 === 0) {
          console.log(
            `⏳ 処理中... ${processedCount}/${unprocessedWords.length}`,
          );
        }
      } catch (error) {
        console.error(
          `⚠️  エラー: "${word.term}" - ${error instanceof Error ? error.message : String(error)}`,
        );
        processedCount++;
      }
    }

    console.log(`\n✨ クリーニング完了！`);
    console.log(`  処理したレコード: ${processedCount} 件`);
    console.log(`  説明文を更新したレコード: ${cleanedCount} 件`);
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
