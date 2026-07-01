-- 업무일지 댓글 (대시보드 팀원 카드별, 날짜별 스레드)
CREATE TABLE "WorkLogComment" (
  "id"           TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "authorId"     TEXT NOT NULL,
  "content"      TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkLogComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkLogComment_targetUserId_date_idx" ON "WorkLogComment"("targetUserId", "date");
CREATE INDEX "WorkLogComment_date_idx" ON "WorkLogComment"("date");

ALTER TABLE "WorkLogComment"
  ADD CONSTRAINT "WorkLogComment_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "WorkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkLogComment"
  ADD CONSTRAINT "WorkLogComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "WorkUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
