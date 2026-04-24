import { prisma } from "../prismaClient";

export function normalizeTitle(text: string) {
  return text.trim().toLowerCase();
}

export async function getExistingTitleSet(guildId: string) {
  const titles = await prisma.title.findMany({
    where: {
      word: {
        guildId,
      },
    },
    select: {
      text: true,
    },
  });

  return new Set(titles.map((title) => normalizeTitle(title.text)));
}

export function findDuplicateTitle(
  titles: string[],
  existingTitles: Set<string>,
) {
  const seenTitles = new Set<string>();

  for (const title of titles) {
    const normalized = normalizeTitle(title);

    if (!normalized) {
      continue;
    }

    if (seenTitles.has(normalized) || existingTitles.has(normalized)) {
      return title;
    }

    seenTitles.add(normalized);
  }

  return null;
}
