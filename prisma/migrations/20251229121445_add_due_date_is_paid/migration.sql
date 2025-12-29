-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT true;
