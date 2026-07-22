import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 환경변수가 설정되어 있지 않습니다.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // 대화형 트랜잭션 기본 제한 — Prisma 기본값은 timeout 5초 / maxWait 2초로,
    // 이 시스템의 일괄 처리에는 너무 짧다. 출고장 생성은 자재 1건마다 4~6회 왕복하므로
    // 20건이면 100회가 넘고, NAS 자체 호스팅 왕복 지연까지 더하면 5초를 넘길 수 있다.
    // 초과하면 P2028 로 트랜잭션 전체가 롤백돼 "눌렀는데 아무 일도 안 일어난다" 가 된다.
    // 강재 엑셀 업로드·선별 마킹·출고 취소도 같은 구조라 전역 기본값으로 올린다.
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
