-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "yearEstablished" INTEGER,
    "country" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressLat" DOUBLE PRECISION,
    "addressLng" DOUBLE PRECISION,
    "addressPlaceId" TEXT,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "coveragePolygon" JSONB NOT NULL,
    "coverageReason" TEXT,
    "responseNumbers" TEXT[],
    "responseEmails" TEXT[],
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_email_key" ON "Institution"("email");
