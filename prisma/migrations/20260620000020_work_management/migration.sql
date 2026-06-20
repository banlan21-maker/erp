-- 업무관리: 사용자 / 업무일지 / 공유글(피드·멘션) / 일정

-- CreateTable
CREATE TABLE "WorkUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dept" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkUser_name_key" ON "WorkUser"("name");

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "todayWork" TEXT NOT NULL DEFAULT '',
    "tomorrowPlan" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkLog_date_idx" ON "WorkLog"("date");
CREATE UNIQUE INDEX "WorkLog_userId_date_key" ON "WorkLog"("userId", "date");

-- CreateTable
CREATE TABLE "WorkPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkPost_createdAt_idx" ON "WorkPost"("createdAt");
CREATE INDEX "WorkPost_important_idx" ON "WorkPost"("important");

-- CreateTable
CREATE TABLE "WorkPostMention" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "WorkPostMention_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkPostMention_userId_idx" ON "WorkPostMention"("userId");
CREATE UNIQUE INDEX "WorkPostMention_postId_userId_key" ON "WorkPostMention"("postId", "userId");

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkSchedule_date_idx" ON "WorkSchedule"("date");

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WorkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPost" ADD CONSTRAINT "WorkPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "WorkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPostMention" ADD CONSTRAINT "WorkPostMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WorkPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPostMention" ADD CONSTRAINT "WorkPostMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WorkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WorkUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
