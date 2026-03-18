-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'claude-runner',
    "status" TEXT NOT NULL,
    "startedAt" BIGINT NOT NULL,
    "finishedAt" BIGINT,
    "log" TEXT NOT NULL DEFAULT '',
    "analysisResult" JSONB
);

-- CreateTable
CREATE TABLE "JobIssue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    CONSTRAINT "JobIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "prUrl" TEXT,
    CONSTRAINT "JobResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrReviewComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prUrl" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "commentId" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "line" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "fixCommit" TEXT,
    "createdAt" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "githubRepo" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "PrReviewComment_type_commentId_key" ON "PrReviewComment"("type", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Repo_label_key" ON "Repo"("label");
