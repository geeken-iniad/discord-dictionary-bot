import { prisma } from "../prismaClient";

async function main() {
  const total = await prisma.wikiWord.count();
  const processed = await prisma.wikiWord.count({ where: { processed: true } });
  const unprocessed = await prisma.wikiWord.count({
    where: { processed: false },
  });

  const leadingSample = await prisma.wikiWord.findMany({
    where: {
      processed: true,
      OR: [
        { meaning: { startsWith: "、" } },
        { meaning: { startsWith: "，" } },
        { meaning: { startsWith: "," } },
      ],
    },
    select: { id: true, term: true, meaning: true },
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        total,
        processed,
        unprocessed,
        leadingSample: leadingSample.map((x) => ({
          id: x.id,
          term: x.term,
          meaning: x.meaning.slice(0, 80),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
