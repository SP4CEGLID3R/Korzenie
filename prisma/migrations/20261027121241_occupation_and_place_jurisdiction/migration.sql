-- AlterEnum
ALTER TYPE "app"."EventType" ADD VALUE 'OCCUPATION';

-- AlterTable
ALTER TABLE "app"."Place" ADD COLUMN     "jurisdiction" TEXT;
