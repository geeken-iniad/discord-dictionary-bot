import { Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { prisma } from "../prismaClient";

dotenv.config();

type Mode = "dry-run" | "apply";

type AIResult = {
  contextLabel: string;
  keywords: string[];
};

type AIProvider = "openai" | "gemini";

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

  return { mode, limit, includeCompleted };
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

async function callOpenAI(prompt: string): Promise<AIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が未設定です");
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは辞書Botの文脈分類器です。必ずJSONで返してください。contextLabelは短い英小文字スネークケース。keywordsは2-8個の短い日本語キーワード。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API から応答が取得できませんでした");
  }

  const parsed = JSON.parse(pickJsonText(content)) as Partial<AIResult>;

  return sanitizeAIResult({
    contextLabel: String(parsed.contextLabel || "general"),
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map((item) => String(item))
      : [],
  });
}

async function callGemini(prompt: string): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY または OPENAI_API_KEY が未設定です");
  }

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const baseUrl =
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const response = await fetch(
    `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "あなたは辞書Botの文脈分類器です。必ずJSONで返してください。",
                  "contextLabelは短い英小文字スネークケース。keywordsは2-8個の短い日本語キーワード。",
                  prompt,
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error("Gemini API から応答が取得できませんでした");
  }

  const parsed = JSON.parse(pickJsonText(content)) as Partial<AIResult>;

  return sanitizeAIResult({
    contextLabel: String(parsed.contextLabel || "general"),
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map((item) => String(item))
      : [],
  });
}

function resolveProvider(): AIProvider {
  const rawProvider = (process.env.AI_PROVIDER || "auto").toLowerCase();
  if (rawProvider === "openai" || rawProvider === "gemini") {
    return rawProvider;
  }

  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (geminiKey.startsWith("AIza")) {
    return "gemini";
  }

  return "openai";
}

async function callAI(prompt: string): Promise<AIResult> {
  const provider = resolveProvider();
  if (provider === "gemini") {
    return callGemini(prompt);
  }

  return callOpenAI(prompt);
}

function buildPrompt(input: {
  titles: string[];
  meaning: string;
  tag: string | null;
  existingContextLabel: string | null;
  existingKeywords: string | null;
}) {
  const titleText = input.titles.join(" / ");
  return [
    "次の辞書データに対して、文脈分類ラベルとキーワードを提案してください。",
    '出力はJSONのみ。形式: {"contextLabel":"...","keywords":["..."]}',
    "contextLabelは英小文字スネークケースで1語相当。",
    "keywordsは日本語中心で2-8個、短く具体的に。",
    "汎用語(もの/こと/それ など)は避ける。",
    `title: ${titleText}`,
    `meaning: ${input.meaning}`,
    `tag: ${input.tag || ""}`,
    `existing contextLabel: ${input.existingContextLabel || ""}`,
    `existing keywords: ${input.existingKeywords || ""}`,
  ].join("\n");
}

async function main() {
  const { mode, limit, includeCompleted } = parseArgs();
  const provider = resolveProvider();

  console.log(
    `mode=${mode}, limit=${limit}, includeCompleted=${includeCompleted}, provider=${provider}`,
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

  for (const word of targets) {
    const prompt = buildPrompt({
      titles: word.titles.map((t: { text: string }) => t.text),
      meaning: word.meaning,
      tag: word.tag,
      existingContextLabel: word.contextLabel,
      existingKeywords: word.contextKeywords,
    });

    try {
      const aiResult = await callAI(prompt);
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

    await new Promise((resolve) => setTimeout(resolve, 300));
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
