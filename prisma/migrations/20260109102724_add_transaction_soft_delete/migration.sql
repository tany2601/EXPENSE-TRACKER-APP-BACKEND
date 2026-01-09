-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByDeviceId" TEXT;
