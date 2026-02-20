import { PrismaClient } from "@prisma/client";

// アプリ全体で1つのPrismaClientを使い回す設定
export const prisma = new PrismaClient();
