/*
  Warnings:

  - You are about to drop the column `isCustom` on the `Repo` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Repo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL
);
INSERT INTO "new_Repo" ("githubRepo", "id", "label", "name", "path") SELECT "githubRepo", "id", "label", "name", "path" FROM "Repo";
DROP TABLE "Repo";
ALTER TABLE "new_Repo" RENAME TO "Repo";
CREATE UNIQUE INDEX "Repo_label_key" ON "Repo"("label");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
