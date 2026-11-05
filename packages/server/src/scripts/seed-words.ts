import { prisma } from "../db";

const words = [
  { text: "parkour", category: "movement" },
  { text: "vault", category: "movement" },
  { text: "rooftop", category: "place" },
  { text: "bridge", category: "place" },
  { text: "wall", category: "obstacle" },
];

async function seedWords() {
  try {
    await Promise.all(
      words.map(word =>
        prisma.word.upsert({
          where: { text: word.text },
          update: { category: word.category },
          create: word,
        }),
      ),
    );

    console.log(`Seeded ${words.length} words.`);
  } catch (error) {
    console.error("Failed to seed words:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void seedWords();
