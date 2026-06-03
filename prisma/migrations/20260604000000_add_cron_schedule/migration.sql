-- CreateTable
CREATE TABLE "CronSchedule" (
    "name"       TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronSchedule_pkey" PRIMARY KEY ("name")
);
