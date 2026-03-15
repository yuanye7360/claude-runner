-- CreateTable
CREATE TABLE "PrReviewComment" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrReviewComment_commentId_key" ON "PrReviewComment"("commentId");
