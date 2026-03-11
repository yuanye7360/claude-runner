-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" BIGINT NOT NULL,
    "finishedAt" BIGINT,
    "log" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobIssue" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "JobIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobResult" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "prUrl" TEXT,

    CONSTRAINT "JobResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobResult" ADD CONSTRAINT "JobResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
