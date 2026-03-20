-- CreateTable
CREATE TABLE "PrReview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "repoLabel" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT NOT NULL,
    "prAuthor" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "blockers" INTEGER NOT NULL DEFAULT 0,
    "majors" INTEGER NOT NULL DEFAULT 0,
    "minors" INTEGER NOT NULL DEFAULT 0,
    "suggestions" INTEGER NOT NULL DEFAULT 0,
    "summaryComment" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PrReview_repoLabel_prNumber_commitSha_key" ON "PrReview"("repoLabel", "prNumber", "commitSha");
