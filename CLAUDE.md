@AGENTS.md

# CNC 절단 파트 ERP 시스템

## 프로젝트 개요
- **회사**: 조선업 CNC 철판 절단 전문 기업 (선박·라싱브릿지 부재 절단)
- **기술 스택**: Next.js · TypeScript · Prisma · PostgreSQL · Docker
- **인프라**: 유그린 NAS DXP4800 Plus (Docker 자체 호스팅, 외부 포트 5002)
- **외부 접속**: UGREENlink 내장 DDNS

## 기술 규칙
- Next.js App Router 방식만 사용 (Pages Router 사용 금지)
- 동적 API Route에 `export const dynamic = "force-dynamic"` 필수
- 응답은 `NextResponse.json()`으로 통일
- UI: Tailwind CSS + shadcn/ui

## 디렉터리 구조
```
app/
├── (main)/           # 메인 레이아웃 그룹
│   ├── cutpart/      # 절단 파트 (dashboard, projects, drawings, worklog, schedule, reports)
│   ├── supply/       # 구매/자재 파트
│   └── management/   # 관리 파트 (workers, equipment, vendors)
├── field/            # 현장용 모바일 (별도 레이아웃, 독립 유지)
└── api/              # API Routes
```

## 모듈 구성
- **절단 파트**: 프로젝트·호선 관리, 도면·강재리스트, 스케줄, 작업일보, 잔재관리, 보고서
- **구매/자재 파트**: 재고관리, 입출고, 월별 사용량
- **관리 파트**: 인원관리, 장비관리, 거래처 관리

## 배포 방법
1. Claude가 코드 수정 → GitHub 푸시
2. NAS SSH 접속: `ssh kortech@59.4.248.240 -P 22`
3. 배포 명령: `cd ~/erp_namhun/erp/cnc-erp && sudo docker compose run --rm git-sync && sudo docker compose up --build -d app`

## 도메인 용어
- **호선**: 프로젝트 단위 식별 코드 (예: RS01, 1022)
- **블록**: 선박 구역 단위 식별 코드 (예: F52P, B40P)
- **네스팅**: 철판 위에 부재를 최적 배치하는 작업
- **강재리스트**: 절단에 필요한 철판의 재질·규격·수량 목록
- **기성**: 완료된 절단 물량에 대해 원청에 청구하는 금액
- **잔재**: 절단 후 남은 철판 조각 (현장잔재/등록잔재/여유원재)
