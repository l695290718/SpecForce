CREATE TABLE "DeploymentBootstrap" (
    "bootstrapKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "counts" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeploymentBootstrap_pkey" PRIMARY KEY ("bootstrapKey")
);

CREATE INDEX "DeploymentBootstrap_status_idx" ON "DeploymentBootstrap"("status");
