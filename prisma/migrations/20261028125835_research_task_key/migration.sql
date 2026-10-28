-- DropIndex
DROP INDEX "app"."ResearchTask_personId_status_idx";

-- AlterTable
ALTER TABLE "app"."ResearchTask" ADD COLUMN     "key" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "ResearchTask_treeId_status_idx" ON "app"."ResearchTask"("treeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchTask_personId_key_key" ON "app"."ResearchTask"("personId", "key");

