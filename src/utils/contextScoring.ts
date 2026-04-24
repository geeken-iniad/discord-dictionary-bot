export type ContextScoredWord = {
  id: number;
  meaning: string;
  tag?: string | null;
  contextLabel?: string | null;
  contextKeywords?: string | null;
  titles?: Array<{ text: string }>;
};

export function normalizeContextText(str: string): string {
  return str
    .replace(/[\u3041-\u3096]/g, (match) =>
      String.fromCharCode(match.charCodeAt(0) + 0x60),
    )
    .toLowerCase()
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

export function normalizeTitleForGroup(text: string): string {
  return normalizeContextText(text);
}

export function splitContextKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(/[,、/\n]/)
    .map((item) => normalizeContextText(item))
    .filter((item) => item.length > 0);
}

export function findDuplicateWithinInput(titles: string[]): string | null {
  const seen = new Set<string>();

  for (const title of titles) {
    const normalized = normalizeTitleForGroup(title);
    if (!normalized) continue;

    if (seen.has(normalized)) {
      return title;
    }

    seen.add(normalized);
  }

  return null;
}

export function getPrimaryTitle(word: ContextScoredWord): string {
  return normalizeTitleForGroup(word.titles?.[0]?.text || `word-${word.id}`);
}

export function calculateContextScore(
  word: ContextScoredWord,
  normalizedContent: string,
): number {
  const keywords = splitContextKeywords(word.contextKeywords);
  const label = normalizeContextText(word.contextLabel || "");
  const tag = normalizeContextText(word.tag || "");

  let score = 0;

  if (label && normalizedContent.includes(label)) {
    score += 0.35;
  }

  if (tag && normalizedContent.includes(tag)) {
    score += 0.2;
  }

  for (const keyword of keywords) {
    if (normalizedContent.includes(keyword)) {
      score += 0.15;
    }
  }

  // 文脈候補が多いほど加点しすぎないように丸める
  return Math.min(score, 1);
}
