-- CreateTable
CREATE TABLE "Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Word_term_key" ON "Word"("term");
