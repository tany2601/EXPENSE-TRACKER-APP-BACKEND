-- CreateTable
CREATE TABLE "public"."OtpThrottle" (
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "failedVerifyCount" INTEGER NOT NULL DEFAULT 0,
    "verifyLockedUntil" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "sendWindowStart" TIMESTAMP(3),
    "sendLockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpThrottle_pkey" PRIMARY KEY ("email","type")
);
