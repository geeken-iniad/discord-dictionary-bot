import { Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { prisma } from "../prismaClient";

dotenv.config();

type Mode = "dry-run" | "apply";

type AIResult = {
  contextLabel: string;
  keywords: string[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  const hasApply = args.includes("--apply");
  const mode: Mode = hasApply ? "apply" : "dry-run";

  const limitIndex = args.findIndex((arg) => arg === "--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const parsedLimit = limitRaw ? Number(limitRaw) : 50;
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

  const includeCompleted = args.includes("--all");

  const batchSizeIndex = args.findIndex((arg) => arg === "--batch-size");
  const batchSizeRaw =
    batchSizeIndex >= 0 ? args[batchSizeIndex + 1] : undefined;
  const parsedBatchSize = batchSizeRaw ? Number(batchSizeRaw) : 10;
  const batchSize =
    Number.isInteger(parsedBatchSize) && parsedBatchSize > 0
      ? Math.min(parsedBatchSize, 20)
      : 10;

  return { mode, limit, includeCompleted, batchSize };
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function normalizeKeyword(value: string): string {
  return value
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase()
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

function normalizeContextLabel(value: string): string {
  return normalizeKeyword(value).replace(/\s+/g, "_");
}

function sanitizeAIResult(result: AIResult): AIResult {
  const label = normalizeContextLabel(result.contextLabel || "");
  const dedup = new Set<string>();

  for (const keyword of result.keywords || []) {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) continue;
    if (normalized.length < 2) continue;
    dedup.add(normalized);
    if (dedup.size >= 10) break;
  }

  return {
    contextLabel: label || "general",
    keywords: Array.from(dedup).slice(0, 8),
  };
}

function pickJsonText(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw;
}

function buildLocalResult(input: {
  titles: string[];
  meaning: string;
  tag: string | null;
  existingContextLabel: string | null;
}): AIResult {
  const source = [input.titles.join(" "), input.meaning, input.tag || ""].join(
    " ",
  );

  const stopwords = new Set([
    "です",
    "ます",
    "する",
    "した",
    "して",
    "ある",
    "いる",
    "こと",
    "もの",
    "それ",
    "ため",
    "よう",
    "and",
    "the",
    "for",
    "with",
    "from",
    "this",
    "that",
  ]);

  const matched =
    source.match(
      /[A-Za-z][A-Za-z0-9+_.-]{1,}|[\u3040-\u30ff\u4e00-\u9fff]{2,}/g,
    ) || [];
  const unique = new Set<string>();

  for (const token of matched) {
    const normalized = normalizeKeyword(token);
    if (!normalized) continue;
    if (normalized.length < 2) continue;
    if (stopwords.has(normalized)) continue;
    unique.add(normalized);
    if (unique.size >= 8) break;
  }

  if (unique.size === 0) {
    const titleFallback = normalizeKeyword(input.titles.join(" "));
    if (titleFallback && titleFallback.length >= 2) {
      unique.add(titleFallback);
    }
  }

  if (unique.size === 0) {
    unique.add("用語");
  }

  const existing = normalizeContextLabel(input.existingContextLabel || "");
  const byTag = normalizeContextLabel(input.tag || "");
  const firstKeyword = Array.from(unique)[0] || "";

  return sanitizeAIResult({
    contextLabel:
      existing || byTag || normalizeContextLabel(firstKeyword) || "general",
    keywords: Array.from(unique),
  });
}

async function main() {
  const { mode, limit, includeCompleted, batchSize } = parseArgs();

  console.log(
    `mode=${mode}, limit=${limit}, includeCompleted=${includeCompleted}, batchSize=${batchSize}, localOnly=true`,
  );

  const whereClause: Prisma.WordWhereInput | undefined = includeCompleted
    ? undefined
    : {
        OR: [
          { contextLabel: null },
          { contextLabel: "" },
          { contextKeywords: null },
          { contextKeywords: "" },
        ],
      };

  const targets = await prisma.word.findMany({
    ...(whereClause ? { where: whereClause } : {}),
    include: { titles: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  if (targets.length === 0) {
    console.log("対象データがありません。");
    return;
  }

  let success = 0;
  let failed = 0;

  const chunks = chunkArray(targets, batchSize);

  for (const chunk of chunks) {
    for (const word of chunk) {
      try {
        const aiResult = buildLocalResult({
          titles: word.titles.map((t: { text: string }) => t.text),
          meaning: word.meaning,
          tag: word.tag,
          existingContextLabel: word.contextLabel,
        });
        const joinedKeywords = aiResult.keywords.join(",");

        if (mode === "apply") {
          await prisma.word.update({
            where: { id: word.id },
            data: {
              contextLabel: aiResult.contextLabel,
              contextKeywords: joinedKeywords || null,
            },
          });
        }

        console.log(
          `[OK] id=${word.id} title=${word.titles.map((t: { text: string }) => t.text).join("/")} context=${aiResult.contextLabel} keywords=${joinedKeywords}`,
        );
        success++;
      } catch (error) {
        console.error(
          `[NG] id=${word.id} title=${word.titles.map((t: { text: string }) => t.text).join("/")}`,
          error,
        );
        failed++;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  console.log(`完了: success=${success}, failed=${failed}`);
}

main()
  .catch((error) => {
    console.error("バッチ実行エラー:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
