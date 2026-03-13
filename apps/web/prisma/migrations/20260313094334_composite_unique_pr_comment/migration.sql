-- DropIndex
DROP INDEX IF EXISTS "PrReviewComment_commentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "PrReviewComment_type_commentId_key" ON "PrReviewComment"("type", "commentId");
