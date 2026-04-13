import { prisma } from "../prismaClient";

// スリープ関数
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 末尾のカテゴリ補足（例: "(プログラミング言語)"）を削除して検索ヒットしやすくする
function normalizeTerm(title: string): string {
  return title.replace(/\s*\(プログラミング言語\)$/u, "").trim();
}

// Wikipedia API からカテゴリ内のページを取得
async function getPageNamesFromCategory(
  categoryName: string,
  continueToken?: string,
): Promise<{ titles: string[]; continueToken: string | undefined }> {
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: categoryName,
    cmtype: "page",
    cmlimit: "100",
    format: "json",
    ...(continueToken && { cmcontinue: continueToken }),
  });

  const url = `https://ja.wikipedia.org/w/api.php?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Wikipedia API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    query?: {
      categorymembers?: Array<{ title: string; pageid: number }>;
    };
    continue?: {
      cmcontinue: string;
    };
    error?: { info: string };
  };

  if (data.error) {
    throw new Error(`Wikipedia API error: ${data.error.info}`);
  }

  const titles = data.query?.categorymembers?.map((member) => member.title) || [];
  const newContinueToken = data.continue?.cmcontinue;

  return { titles, continueToken: newContinueToken };
}

// Wikipedia API から個別ページの概要を取得
async function getPageSummary(pageTitle: string): Promise<{
  summary: string;
  url: string;
} | null> {
  const restUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle,
  )}`;

  try {
    const response = await fetch(restUrl);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      type?: string;
      extract?: string;
      title?: string;
    };

    // 曖昧さ回避ページやその他無効なタイプは無視
    if (data.type === "disambiguation" || !data.extract) {
      return null;
    }

    const summary = data.extract.substring(0, 300);
    const url = `https://ja.wikipedia.org/wiki/${encodeURIComponent(
      data.title || pageTitle,
    )}`;

    return { summary, url };
  } catch (error) {
    console.error(`Failed to fetch summary for ${pageTitle}:`, error);
    return null;
  }
}

// メイン処理
async function main() {
  try {
    console.log("🚀 Wikipedia IT用語辞書取得スクリプトを開始します...");

    const categoryName = "Category:プログラミング言語";
    let continueToken: string | undefined;
    let totalProcessed = 0;
    let totalSaved = 0;

    // カテゴリ内の全ページを取得（ページネーション対応）
    do {
      console.log(
        `📖 カテゴリ「${categoryName}」からページを取得中...`,
      );

      const { titles, continueToken: newToken } =
        await getPageNamesFromCategory(categoryName, continueToken);

      continueToken = newToken;

      console.log(`✅ ${titles.length} 件のページタイトルを取得しました`);

      // 各ページの概要を取得
      for (const title of titles) {
        totalProcessed++;
        const normalizedTerm = normalizeTerm(title);

        if (!normalizedTerm) {
          console.log(`⏭️  スキップ: ${title} (正規化後タイトルが空)`);
          await sleep(1000);
          continue;
        }

        const summary = await getPageSummary(title);
        if (!summary) {
          console.log(`⏭️  スキップ: ${title} (概要取得失敗)`);
          await sleep(1000); // API制限回避
          continue;
        }

        // 既存データを更新、または新規作成（upsert）
        await prisma.wikiWord.upsert({
          where: { term: normalizedTerm },
          update: {
            meaning: summary.summary,
            link: summary.url,
          },
          create: {
            term: normalizedTerm,
            meaning: summary.summary,
            link: summary.url,
          },
        });

        totalSaved++;
        console.log(`💾 保存: ${normalizedTerm}`);

        // API制限に引っかからないよう1秒スリープ
        await sleep(1000);
      }

      if (continueToken) {
        console.log("⏳ 次ページを取得中...");
        await sleep(1000);
      }
    } while (continueToken);

    console.log(`\n✨ 完了！処理数: ${totalProcessed}, 保存数: ${totalSaved}`);
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
