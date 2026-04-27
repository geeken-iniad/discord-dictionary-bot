import { prisma } from "../prismaClient";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

async function getPageSummary(pageTitle: string): Promise<string | null> {
  const restUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    pageTitle,
  )}`;

  try {
    const response = await fetch(restUrl);
    if (!response.ok) return null;

    const data = (await response.json()) as {
      type?: string;
      extract?: string;
    };

    if (data.type === "disambiguation" || !data.extract) {
      return null;
    }

    return data.extract;
  } catch {
    return null;
  }
}

async function main() {
  try {
    const broken = await prisma.wikiWord.findMany({
      where: {
        OR: [
          { meaning: { startsWith: "、" } },
          { meaning: { startsWith: "，" } },
          { meaning: { startsWith: "," } },
        ],
      },
      select: { id: true, term: true, meaning: true },
    });

    console.log(`修復対象: ${broken.length} 件`);

    let fixed = 0;
    for (const word of broken) {
      const summary = await getPageSummary(word.term);
      if (!summary) {
        console.log(`スキップ: ${word.term} (summary取得失敗)`);
        continue;
      }

      const cleaned = cleanMeaning(summary, word.term);
      if (/^[、，,。．・\s]+$/u.test(cleaned) || cleaned.length < 8) {
        console.log(`スキップ: ${word.term} (clean後が不正)`);
        continue;
      }

      await prisma.wikiWord.update({
        where: { id: word.id },
        data: { meaning: cleaned, processed: true },
      });

      fixed++;
      console.log(`修復: ${word.term}`);
    }

    console.log(`完了: 修復 ${fixed}/${broken.length} 件`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
