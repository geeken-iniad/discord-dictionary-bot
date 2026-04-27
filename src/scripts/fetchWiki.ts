import { prisma } from "../prismaClient";

// スリープ関数
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 末尾のカテゴリ補足を削除して検索ヒットしやすくする
function normalizeTerm(title: string): string {
  return title
    .replace(/\s*\([^)]*\)$/u, "") // 末尾の全括弧を削除
    .trim();
}

// 正規表現の特殊文字をエスケープ
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 説明文をクリーニング
function cleanMeaning(meaning: string, term: string): string {
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

  cleaned = cleaned
    .replace(/^[、，,。．・:：;；\-ー\s]+/u, "")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();

  if (cleaned.length > 240) {
    const firstPeriod = cleaned.indexOf("。");
    if (firstPeriod > 30 && firstPeriod < 240) {
      cleaned = cleaned.slice(0, firstPeriod + 1);
    } else {
      cleaned = `${cleaned.slice(0, 240)}...`;
    }
  }

  if (/^[、，,。．・\s]+$/u.test(cleaned) || cleaned.length === 0) {
    return meaning.trim();
  }

  return cleaned;
}

// 不要なページを除外するロジック
function shouldSkipPage(title: string): boolean {
  // 名前空間プレフィックス（ウィキペディア固有のページ）
  const skipPrefixes = [
    "Template:",
    "Wikipedia:",
    "Category:",
    "Help:",
    "User:",
    "Project:",
    "File:",
    "Special:",
  ];
  if (skipPrefixes.some((prefix) => title.startsWith(prefix))) {
    return true;
  }

  // 不要なページパターン（日本語）
  const skipPatterns = [
    /の一覧/u,
    /の年表/u,
    /の比較/u,
    /一覧$/u,
    /年表$/u,
    /テンプレート/u,
    /ウィキペディア/u,
  ];
  if (skipPatterns.some((pattern) => pattern.test(title))) {
    return true;
  }

  // 短すぎるタイトル（単一文字や記号のみ）
  const normalized = normalizeTerm(title);
  if (normalized.length < 2) {
    return true;
  }

  return false;
}

// 概要テキストの品質を判定
function isValidSummary(summary: string): boolean {
  if (!summary) return false;

  // 短すぎる概要
  if (summary.length < 50) {
    return false;
  }

  // 不要な文言が含まれている
  const invalidPatterns = [
    /曖昧さ回避/,
    /ページが存在しません/,
    /リダイレクト/,
    /見直す必要があります/,
    /ウィキペディアに加筆できます/,
  ];
  if (invalidPatterns.some((pattern) => pattern.test(summary))) {
    return false;
  }

  return true;
}

// Wikipedia API からカテゴリ内のページを取得
async function getPageNamesFromCategory(
  categoryName: string,
  continueToken?: string,
  retryCount: number = 0,
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

  try {
    const response = await fetch(url);

    if (response.status === 429) {
      // レート制限エラーの場合、指数バックオフでリトライ
      const waitTime = Math.pow(2, retryCount) * 5000; // 5, 10, 20秒...
      console.warn(`⚠️  レート制限(429)。${waitTime}ms 待機後リトライ...`);
      await sleep(waitTime);
      return getPageNamesFromCategory(
        categoryName,
        continueToken,
        retryCount + 1,
      );
    }

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

    const titles =
      data.query?.categorymembers?.map((member) => member.title) || [];
    const newContinueToken = data.continue?.cmcontinue;

    return { titles, continueToken: newContinueToken };
  } catch (error) {
    console.error(`Failed to fetch category members:`, error);
    throw error;
  }
}

// Wikipedia API から個別ページの概要を取得
async function getPageSummary(
  pageTitle: string,
  retryCount: number = 0,
): Promise<{
  summary: string;
  url: string;
} | null> {
  const restUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle,
  )}`;

  try {
    const response = await fetch(restUrl);

    if (response.status === 429) {
      // レート制限エラーの場合、指数バックオフでリトライ
      const waitTime = Math.pow(2, retryCount) * 3000; // 3, 6, 12秒...
      console.warn(
        `⚠️  ${pageTitle} レート制限(429)。${waitTime}ms 待機後リトライ...`,
      );
      await sleep(waitTime);
      return getPageSummary(pageTitle, retryCount + 1);
    }

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

    const categoryName = "Category:ウェブブラウザ";
    let continueToken: string | undefined;
    let totalProcessed = 0;
    let totalSaved = 0;

    // カテゴリ内の全ページを取得（ページネーション対応）
    do {
      console.log(`📖 カテゴリ「${categoryName}」からページを取得中...`);

      const { titles, continueToken: newToken } =
        await getPageNamesFromCategory(categoryName, continueToken);

      continueToken = newToken;

      console.log(`✅ ${titles.length} 件のページタイトルを取得しました`);

      // 各ページの概要を取得
      for (const title of titles) {
        totalProcessed++;

        // 不要なページを早期に除外
        if (shouldSkipPage(title)) {
          console.log(`⏭️  スキップ: ${title} (不要なページパターン)`);
          await sleep(2000);
          continue;
        }

        const normalizedTerm = normalizeTerm(title);

        if (!normalizedTerm) {
          console.log(`⏭️  スキップ: ${title} (正規化後タイトルが空)`);
          await sleep(2000);
          continue;
        }

        // DBに既に存在する単語をスキップ
        const existingWord = await prisma.wikiWord.findUnique({
          where: { term: normalizedTerm },
        });

        if (existingWord) {
          console.log(`⏭️  スキップ: ${normalizedTerm} (既にDB に存在)`);
          await sleep(2000);
          continue;
        }

        const summary = await getPageSummary(title);
        if (!summary) {
          console.log(`⏭️  スキップ: ${title} (概要取得失敗)`);
          await sleep(2000); // API制限回避
          continue;
        }

        // 概要テキストの品質判定
        if (!isValidSummary(summary.summary)) {
          console.log(`⏭️  スキップ: ${title} (概要テキストの品質が低い)`);
          await sleep(2000);
          continue;
        }

        const cleanedMeaning = cleanMeaning(summary.summary, normalizedTerm);

        // 新規レコードを作成
        await prisma.wikiWord.create({
          data: {
            term: normalizedTerm,
            meaning: cleanedMeaning,
            link: summary.url,
            processed: true,
          },
        });

        totalSaved++;
        console.log(`💾 保存: ${normalizedTerm}`);

        // API制限に引っかからないよう2秒スリープ
        await sleep(2000);
      }

      if (continueToken) {
        console.log("⏳ 次ページを取得中...");
        await sleep(3000);
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
