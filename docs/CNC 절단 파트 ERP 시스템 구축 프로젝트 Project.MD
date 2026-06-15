|**CNC 절단 파트** **ERP 시스템 구축 프로젝트** Project Agent Guideline v1.9|
|-|

|**프로젝트명**|CNC 절단 파트 맞춤형 ERP 시스템 구축|
|-|-|
|**대상 기업**|CNC 절단 파트 (조선업 관련 철판 절단 전문)|
|**기술 스택**|Next.js · TypeScript · Prisma · PostgreSQL · Docker (NAS)|
|**인프라**|유그린 NAS DXP4800 Plus (UGOS Pro · Docker Engine 26.1)|
|**버전**|v1.9 — 2026-05-26 (Phase 1·HTTPS 완료, 사내 도구 포털 도메인 추가)|

# **1. 회사 및 업무 개요**

## **1.1 회사 소개**

본 회사는 조선업 분야 전문 CNC 철판 절단 기업으로, 선박 및 라싱브릿지(컨테이너 선박 결박 부품) 등의 철판 부재를 주력으로 절단한다.

## **1.2 보유 장비**

|**장비**|**수량**|**주요 용도**|
|-|-|-|
|플라즈마 절단기|4대|주력 절단 장비 — 정밀 형상 절단|
|가스 절단기|1대|후판 및 직선 절단 보조|

## **1.3 프로젝트 유형**

|**유형 A — 외부 설계 절단도면 수신형**|
|-|

외부 설계사로부터 절단 완성 도면과 자재리스트를 전달받아, CNC 코드 작업 후 절단을 진행하는 형태. 선박 관련 프로젝트가 주를 이룬다.

|**유형 B — 자사 네스팅 직접 수행형**|
|-|

자회사 설계부에서 기본설계 데이터를 전달받아, 단품도 작성 → 네스팅 → 자재리스트 산출까지 직접 수행한 후 절단하는 형태. 라싱브릿지 프로젝트가 대표적이다.

# **2. 업무 공정 정의**

## **2.1 유형 A — 외부 도면 수신 공정**

|**순서**|**공정명**|**주요 내용**|**담당**|
|-|-|-|-|
|1|도면·자재리스트 접수|원청으로부터 절단도면(DXF/PDF) 및 강재리스트(Excel) 수신|사무|
|2|CNC 코드 작업|수신 도면 기반 CNC 절단 프로그램 작성 (네스팅 포함)|CNC담당|
|3|자재 입고|강재리스트 기준 철판 입고 — 재질·두께·규격·매수 검수|현장|
|4|자재 선별|작업지시 기준 해당 철판 선별 및 준비|현장|
|5|도면 출력·코드 전달|절단 도면 출력, CNC 코드 장비 이송|CNC담당|
|6|절단|플라즈마·가스 절단기 투입 및 절단 실행|현장|
|7|후처리 (개선·그라인딩)|절단 부재 버(burr) 제거, 면취, 치수 확인|현장|
|8|절단품 선별·검사|치수·외관 검수, 합격·불합격 판정|현장|
|9|출고|납품처별 출고 처리, 거래명세서 발행|사무|

## **2.2 유형 B — 자사 네스팅 직접 수행 공정**

|**순서**|**공정명**|**주요 내용**|**담당**|
|-|-|-|-|
|1|기본도면 접수|자회사 설계부로부터 기본설계 도면 수신|사무|
|2|단품도 작성|기본도면에서 부재별 단품 형상 도면 추출·작성|CNC담당|
|3|네스팅·자재리스트 산출|단품을 철판에 최적 배치 (네스팅), 강재리스트 산출|CNC담당|
|4|자재 발주|산출된 자재리스트를 구매부에 전달 → 발주 진행|사무|
|5|CNC 코드 작업|네스팅 데이터 기반 CNC 절단 프로그램 생성|CNC담당|
|6|자재 입고|발주 자재 입고 — 재질·두께·규격·매수 검수|현장|
|7|자재 선별|작업지시 기준 해당 철판 선별 및 준비|현장|
|8|도면 출력·코드 전달|절단 도면 출력, CNC 코드 장비 이송|CNC담당|
|9|절단|플라즈마·가스 절단기 투입 및 절단 실행|현장|
|10|후처리 (개선·그라인딩)|절단 부재 버 제거, 면취, 치수 확인|현장|
|11|절단품 선별·검사|치수·외관 검수, 합격·불합격 판정|현장|
|12|출고|납품처별 출고 처리, 거래명세서 발행|사무|

# **3. ERP 모듈 구성**

## **3.1 Phase 1 — 메인 공정 ERP (구현 완료)**

|**모듈**|**주요 기능**|**상태**|
|-|-|-|
|프로젝트·호선 관리|호선 등록, 블록 관리, 유형 A/B 구분|✅ 완료|
|도면·강재리스트 관리|Excel 업로드·자동 파싱, 프리셋 관리, 수동 추가|✅ 완료|
|스케줄 관리|CNC 일정 배치, 간트차트, 부하 계산, 드래그 일정 조정|✅ 완료|
|작업일보|현장 작업 실적 등록, 장비별 기록|✅ 완료|
|잔재 관리|잔재 등록·조회|✅ 완료|
|돌발작업 관리|돌발 작업 등록·처리|✅ 완료|
|현황 대시보드|프로젝트별 공정 진행률, 장비 가동 현황|✅ 완료|

## **3.2 Phase 2 — 관리 업무 ERP (일부 구현)**

|**모듈**|**주요 기능**|**상태**|
|-|-|-|
|인원 관리|직원 등록·조회, 신체사이즈 포함 정보 관리|✅ 완료|
|장비 관리|절단기 이력, 점검일 관리|✅ 완료|
|구매/자재 파트|재고관리, 거래처, 입출고이력|✅ 완료|
|절단 실적 통계|월별·프로젝트별 집계|🔄 예정|
|기성 관리|청구서 발행, 기성 수금 현황|🔄 예정|
|소모성 자재 관리|소모품 입출고, 재고 현황|🔄 예정|

# **4. 기술 스택 및 아키텍처**

## **4.1 확정 기술 스택**

|**구분**|**기술**|**역할**|
|-|-|-|
|프론트엔드|Next.js 16.2.0 (App Router)|화면 UI — 반응형 웹 (PC·태블릿·스마트폰)|
|언어|TypeScript|전체 코드베이스 — 타입 안정성 확보|
|백엔드|Next.js API Routes|서버 로직 — 별도 백엔드 서버 없이 통합|
|ORM|Prisma|DB 연결·쿼리 — TypeScript 기반 타입 안전 ORM|
|데이터베이스|PostgreSQL 16|메인 데이터 저장소 — 다중 접속·대용량 처리|
|UI 컴포넌트|Tailwind CSS + shadcn/ui|빠른 UI 개발, 일관된 디자인 시스템|
|간트차트|frappe-gantt v1.2.2|CNC 스케줄 시각화|
|컨테이너|Docker + Docker Compose|NAS 배포 환경 — 패키지 이식성 확보|
|인프라|유그린 NAS DXP4800 Plus|온프레미스 서버 — 추가 비용 없는 자체 호스팅|
|외부 접속|UGREENlink (내장 DDNS)|복잡한 설정 없이 외부 브라우저 접속 가능|

## **4.2 시스템 아키텍처**

```
[ 접속 클라이언트 ] → 인터넷 / 사내 Wi-Fi → 유그린 NAS (Docker)
```

|**Docker 컨테이너**|**내용**|**포트**|
|-|-|-|
|cnc-erp-app|Next.js (프론트 + API)|외부 5002 → 내부 3000|
|cnc-erp-db|PostgreSQL 데이터베이스|외부 5003 → 내부 5432|
|git-sync|GitHub에서 소스 동기화 (1회성 실행)|없음|

# **5. 핵심 데이터 모델 (Prisma Schema)**

|**테이블명**|**주요 필드**|**설명**|
|-|-|-|
|Project|id, projectCode, projectName, type(A/B), client, status|호선 단위 프로젝트 마스터|
|DrawingList|id, projectId, block, drawingNo, material, thickness, width, length, qty, steelWeight, useWeight, status|강재리스트 데이터|
|CncSchedule|id, projectId, vesselCode, blockName, plannedStart, plannedEnd, status, workType, priority|CNC 절단 스케줄|
|CuttingLog|id, equipmentId, operator, startAt, endAt, status|작업일보 실적|
|Worker|id, name, nationality, birthDate, phone, role, position, joinDate, 신체사이즈 등|인원 정보|
|Equipment|id, name, type, status, lastInspection, nextInspection|절단기 장비 마스터|
|ExcelPreset|id, name, 열번호 매핑 정보|강재리스트 Excel 파싱 프리셋|

# **6. 개발 단계 (Roadmap)**

|**단계**|**내용**|**상태**|
|-|-|-|
|Phase 0 환경 구성|NAS Docker 환경, Next.js 초기화, PostgreSQL, 외부 접속 확인|✅ 완료|
|Phase 1-A 핵심 기능|프로젝트·강재리스트·스케줄·대시보드|✅ 완료|
|Phase 1-B 공정 연결|작업일보, 잔재관리, 돌발작업|✅ 완료|
|Phase 1-C 마무리|반응형 UI, 간트차트 최적화|✅ 완료|
|Phase 2 관리 모듈|인원관리, 장비관리, 구매/자재 파트|✅ 완료 (일부)|
|Phase 2 추가 모듈|기성관리, 소모품, 차량·지게차|🔄 예정|

# **7. 프로젝트 AI 에이전트 지침**

## **7.1 에이전트 역할 정의**

|**이 AI 에이전트는 CNC 절단 파트 ERP 시스템의 풀스택 개발 파트너다.**|
|-|

- 업무 도메인: 조선업 CNC 철판 절단 (선박·라싱브릿지)
- 기술 스택: Next.js · TypeScript · Prisma · PostgreSQL · Docker
- 인프라: 유그린 NAS DXP4800 Plus (자체 호스팅, 추가 클라우드 비용 없음)
- 개발 방식: 바이브코딩 — 사용자 요청 단위로 기능을 순차적으로 구현

## **7.2 코드 작성 원칙**

- 모든 코드는 TypeScript로 작성한다.
- 외부 라이브러리 타입 오류가 불가피한 경우에만 `any` 캐스팅을 허용한다 (예: frappe-gantt popup 반환 타입).
- Prisma Client를 통해 DB에 접근한다. raw SQL 직접 작성은 최소화한다.
- Next.js App Router 방식을 사용한다. Pages Router 방식을 사용하지 않는다.
- UI는 Tailwind CSS와 shadcn/ui 컴포넌트를 기반으로 작성한다.
- API Route는 `/app/api/` 경로에 위치시키고, 응답은 `NextResponse.json()`으로 통일한다.
- 에러 처리는 try-catch로 감싸고, 사용자에게 명확한 메시지를 반환한다.
- 컴포넌트는 Server Component를 기본으로 하고, 상호작용이 필요한 경우만 `'use client'`를 사용한다.
- 동적 데이터를 반환하는 API Route는 반드시 `export const dynamic = "force-dynamic"` 선언.

## **7.3 도메인 용어 사전**

|**용어**|**설명**|
|-|-|
|호선|프로젝트 단위 식별 코드 (예: RS01, 1022)|
|블록|선박 구역 단위 식별 코드 (예: F52P, B40P)|
|네스팅|철판 위에 부재를 최적으로 배치하는 작업|
|강재리스트|절단에 필요한 철판의 재질·규격·수량 목록 (원청 제공 Excel)|
|단품도|개별 부재 하나의 형상 도면|
|POR NO|원청 측 자재 관리 번호|
|NEST NAME|네스팅 파일명 = 당사 도면번호 식별자|
|기성|완료된 절단 물량에 대해 원청에 청구하는 금액|
|개선|절단 후 부재 모서리·면을 다듬는 후처리 작업|
|라싱브릿지|컨테이너 선박에서 컨테이너를 고정하는 결박 구조물 부품|

## **7.3a 자재 4구분 — 명칭 통일 ⚠ 필독**

전 시스템에서 자재는 다음 4가지로만 분류한다. 다른 표현(예: "원재사용") 신규 금지.

| # | 명칭 (표준) | DB 모델·필드 | 호선 매칭 | 비고 |
|---|---|---|---|---|
| 1 | **정규원재** | `SteelPlan` (외부 입고 구매원판) | **필수** — `SteelPlan.vesselCode == Project.projectCode` | 강재입고관리 = 전체강재리스트 |
| 2 | **등록잔재** | `Remnant.type = REGISTERED` | 불필요 (재질·사이즈 매칭) | 원판 절단 후 다른 곳에 사용 예정 |
| 3 | **현장잔재** | `Remnant.type = REMNANT` | 불필요 (재질·사이즈 매칭) | 절단 후 남은 일반 잔재 |
| 4 | **여유원재** | `Remnant.type = SURPLUS` | 불필요 (재질·사이즈 매칭) | 특정 프로젝트에 사용하려다 남은 자재 — **사각형만** (폭2/길이2 없음) |

### 호선 매칭 정책 (가장 핵심)

- **정규원재만 호선코드 매칭 필요** — `Project.projectCode` 와 `SteelPlan.vesselCode` 문자열 일치
- 잔재 3종(등록/현장/여유) 은 호선 무관 — 재질·두께·사이즈로만 매칭
- ⚠ 따라서 정규원재를 한 장이라도 쓸 가능성이 있는 호선은 **호선코드 변경 금지** (매칭 깨짐)

### 블록별 강재리스트 표시 순서 (2026-06-11 확정)

블록별 강재리스트 화면(`drawing-table.tsx`)의 세션 표시 순서:

1. **정규원재 사용 리스트** (= 기존 "원재사용 목록", 라벨 변경)
2. **여유원재 사용 리스트** (사각형만 — 폭2/길이2 컬럼 없음)
3. **등록잔재 사용 리스트**
4. **현장잔재 사용 리스트**

## **7.3b 원재 → 잔재 발생 흐름 및 판번호 연속성 ⚠ 필독 (2026-06-15 추가)**

### 원재(原板)의 정의 — 절단 한 번도 안 한 원판

자재 4구분 중 다음 2종은 **아직 한 번도 절단하지 않은 원판(원재)** 이다. 이 둘을 합쳐 "원재"로 본다.

| 원재 종류 | 위치 | 모델 |
|---|---|---|
| **정규원재** | 강재입출고 → 강재전체목록 | `SteelPlan` |
| **여유원재** | 잔재관리 → 여유원재 | `Remnant.type = SURPLUS` |

→ 등록잔재·현장잔재는 원판을 절단한 뒤에 발생하는 자재다 (원재 아님).

### 판번호(Heat NO) — 실물 확인 후 등록

- 모든 원재에는 판번호가 있으나 현물에서 한 장 한 장 사전 확인이 불가능하다.
- 따라서 **실제 절단 시작 전, 작업자가 실물에서 판번호를 확인해 ERP에 등록**한다.
- **정규원재**: 판번호 등록·연결 구현 완료 (강재전체목록 ↔ 판번호리스트 `SteelPlanHeat`).
- **여유원재**: **구현 완료 (2026-06-15)** — 여유원재 사용 절단 시 현장 작업화면(`field-worklog`)에서 실물 판번호 입력 → 절단완료(`cutting-logs/[id]`) 시 **판번호리스트(`SteelPlanHeat`)에 CUT 으로 자동 추가** + 잔재 레코드(`Remnant.heatNo`)에 판번호 기록. 발생 등록잔재로도 판번호 전파됨. (등록잔재/현장잔재 사용 절단은 기존대로 판번호 없이)

### 잔재 발생 순서 — 원재에서만 잔재가 발생한다

```
원재(정규원재 / 여유원재)  →  등록잔재  →  현장잔재
```

- **등록잔재는 원재에서만 발생**한다 (원판을 절단해 다른 곳에 쓸 큰 단위 잔재).
- 따라서 **여유원재를 사용**하면 그 과정에서도 **등록잔재가 발생할 수 있다.**
- **정규작업의 등록잔재 등록은 이미 구현됨** — 프로젝트에서 블록별 강재(도면) 등록 시 "이 도면에서 발생하는 잔재를 등록"으로 생성 (`drawings-main.tsx` → `POST /api/drawings` → `Remnant.type=REGISTERED`, `drawings/route.ts`).
- **돌발작업 경로의 등록잔재 등록**만 추가 검토 필요 (필요 시).

### 판번호 연속성

판번호는 원재에서 시작해 **등록잔재 → 현장잔재까지 그대로 이어진다.**
(원재의 판번호가 거기서 발생한 등록잔재·현장잔재에 동일하게 연결되어 끝까지 추적 가능해야 함.)

### 구현 현황 / TODO

| 항목 | 상태 |
|---|---|
| 정규원재 판번호 등록·연결 (강재전체목록 ↔ 판번호리스트) | ✅ 구현 |
| 여유원재 판번호 현장 절단 시 입력 → 판번호리스트(SteelPlanHeat) CUT 자동 추가 + 잔재 기록 + 발생 등록잔재 연결 | ✅ 구현 (2026-06-15, field-worklog 입력 + cutting-logs 완료 핸들러) |
| 등록잔재 — 정규작업(블록강재등록) 경로에서 등록 | ✅ 구현 (이미 가능) |
| 등록잔재 — 돌발작업 경로에서 등록 | 🔄 검토 (필요 시) |
| 판번호 원재 → 등록잔재 전파 (절단완료 시 등록잔재 `heatNo` 자동 기입) | ✅ 구현 (2026-06-15, `cutting-logs/[id]` 완료 핸들러: `drawingListId` 연결 등록잔재에 실사용 판번호 기입) |
| 판번호 등록잔재 → 현장잔재 전파 | ⛔ 미구현 (다음 작업) |

## **7.4 파일·디렉터리 구조 (현재 기준)**

```
cnc-erp/
├── app/
│   ├── (main)/                    # 메인 레이아웃 그룹
│   │   ├── cutpart/               # 절단 파트
│   │   │   ├── dashboard/         # 절단 대시보드
│   │   │   ├── projects/          # 프로젝트·호선
│   │   │   │   ├── [id]/          # 프로젝트 상세
│   │   │   │   ├── new/           # 프로젝트 신규 등록
│   │   │   │   └── vessel/[code]/ # 호선별 상세
│   │   │   ├── drawings/          # 강재관리
│   │   │   ├── worklog/           # 작업일보
│   │   │   ├── workorders/        # 작업지시
│   │   │   │   └── new/
│   │   │   ├── schedule/          # 스케줄 생성
│   │   │   │   └── view/          # 스케줄 확인
│   │   │   └── reports/           # 보고서
│   │   ├── supply/                # 구매/자재 파트
│   │   │   ├── dashboard/
│   │   │   ├── inventory/         # 재고관리
│   │   │   ├── inout/             # 입출고관리
│   │   │   ├── stats/             # 월별 사용량
│   │   │   └── vendors/[id]/      # 거래처
│   │   └── management/            # 관리 파트
│   │       ├── dashboard/
│   │       ├── workers/           # 인원관리
│   │       ├── equipment/[id]/    # 장비관리
│   │       └── vendors/[id]/      # 거래처 관리
│   ├── field/                     # 현장용 모바일 (별도 레이아웃)
│   │   ├── worklog/               # 현장 작업일보
│   │   └── supply/                # 현장 입출고
│   ├── api/                       # API Routes
│   │   ├── projects/              # 프로젝트 CRUD
│   │   │   ├── [id]/
│   │   │   └── blocks/            # 호선별 블록 목록
│   │   ├── drawings/[id]/         # 강재리스트
│   │   ├── schedules/             # 스케줄 CRUD + 간트 + 부하
│   │   │   ├── [id]/
│   │   │   ├── gantt/
│   │   │   └── load/
│   │   ├── cutting-logs/[id]/     # 작업일보
│   │   ├── workorders/[id]/       # 작업지시
│   │   ├── remnants/[id]/         # 잔재관리
│   │   ├── urgent-works/[id]/     # 돌발작업
│   │   ├── workers/[id]/          # 인원관리
│   │   ├── equipment/[id]/        # 절단기 장비 (CNC)
│   │   ├── mgmt-equipment/[id]/   # 관리 장비
│   │   ├── mgmt-equipment-kind/   # 장비 종류 프리셋
│   │   ├── mgmt-inspection/[id]/  # 장비 점검
│   │   │   └── complete/
│   │   ├── mgmt-repair/           # 장비 수리
│   │   ├── supply/                # 구매/자재 API
│   │   │   ├── items/[id]/
│   │   │   ├── vendors/[id]/
│   │   │   ├── inbound/
│   │   │   ├── outbound/
│   │   │   ├── stats/
│   │   │   └── dashboard/
│   │   ├── excel-presets/[id]/    # 강재리스트 Excel 파싱 프리셋
│   │   └── dashboard/             # 대시보드 집계
│   │       └── equipment/
│   └── globals.css                # 전역 CSS (frappe-gantt 커스텀 포함)
├── components/                    # 공용 UI 컴포넌트
├── lib/
│   ├── prisma.ts                  # Prisma Client 싱글턴
│   └── excel-parser.ts            # 강재리스트 Excel 파서
├── prisma/
│   └── schema.prisma              # DB 스키마 정의
├── public/
│   └── frappe-gantt.css           # 간트차트 기본 CSS
├── CLAUDE.md                      # Claude AI 프로젝트 컨텍스트 (자동 로드)
├── Dockerfile                     # Docker 빌드 설정
├── docker-compose.yml             # NAS 배포 구성
├── .dockerignore                  # Docker 빌드 제외 목록 (중요!)
└── .env                           # 환경변수 (DB URL 등) — Git 커밋 금지
```

# **8. NAS 배포 구성**

현재 docker-compose.yml 기준:

- **app 컨테이너**: Next.js 앱, 외부 포트 5002
- **db 컨테이너**: PostgreSQL 16, 외부 포트 5003
- **git-sync**: GitHub에서 소스를 NAS로 동기화하는 1회성 컨테이너

# **9. 보안 및 운영 가이드라인**

|**항목**|**지침**|
|-|-|
|인증|현재 관리자 정보 표시 방식 사용 중 (추후 로그인 기능 추가 예정)|
|환경변수|DB 비밀번호는 `.env` 파일 관리 — Git 커밋 금지|
|DB 백업|PostgreSQL 데이터는 NAS Docker 볼륨(pgdata)에 영구 보존|
|접근 제어|UGREENlink를 통한 외부 접속|

# **10. 참고 및 향후 확장 계획**

### **단기 확장**

- 기성 관리: 절단 완료 기준 기성 산출, 청구서 발행
- 소모성 자재 관리: 용접봉·팁·가스 등 소모품 재고 관리
- 장비 점검 알림: 다음 점검일 자동 알림

### **장기 확장 가능성**

- AI 네스팅 최적화: 철판 배치 효율 자동 계산 및 제안
- 원가 분석: 철판 사용률·잔재율 기반 프로젝트별 원가 리포트
- 모바일 앱: 현장 특화 PWA 구성

---

# **배포 관련 사항 정리**

> 비개발자도 쉽게 따라할 수 있도록 작성했습니다.

## 코드 수정은 Claude가 담당

코드 수정은 Claude(AI)가 직접 처리합니다.
수정 후 Claude가 자동으로 GitHub에 올리는 것까지 완료해 줍니다.
**내가 할 일은 NAS 서버에 반영하는 것만입니다.**

---

## 서버 배포 방법 (2단계)

### 1단계 — NAS 서버 접속

터미널(윈도우: 명령프롬프트 또는 PowerShell)을 열고 아래 입력:

```
ssh kortech@59.4.248.240 -P 22
```

비밀번호 입력하면 NAS 서버 안으로 들어갑니다.

---

### 2단계 — 명령어 1줄 실행

NAS 안에서 아래 명령어를 복사해서 붙여넣고 엔터:

```
cd ~/erp_namhun/erp/cnc-erp && sudo docker compose run --rm git-sync && sudo docker compose up --build -d app
```

이 명령어 하나가 아래 3가지를 순서대로 자동으로 처리합니다:

| 순서 | 내용 |
|-|-|
| ① git-sync | GitHub에 올라간 최신 코드를 NAS로 가져옴 |
| ② build | 새 코드로 앱을 새로 빌드(컴파일)함 |
| ③ up | 새로 만든 앱을 서버에 올려서 실행 |

완료되면 브라우저에서 새로고침하면 변경사항이 보입니다.

---

## 주의사항 (중요!)

| 항목 | 내용 |
|-|-|
| 빌드 실패 시 | 에러 메시지를 Claude에게 그대로 붙여넣어 주세요 |
| 변경사항이 안 보일 때 | Ctrl+Shift+R (강제 새로고침) 또는 시크릿 창으로 확인 |
| DB 데이터 | 재배포해도 데이터는 절대 삭제되지 않습니다 (별도 볼륨 보관) |
| .env 파일 | DB 비밀번호가 있으니 GitHub에 올리면 안 됩니다 (자동 제외됨) |

---

## 과거 문제 및 해결 이력 (참고용)

| 문제 | 원인 | 해결 |
|-|-|-|
| 코드 수정해도 서버에 안 보임 | NAS의 `.next` 빌드 캐시가 Docker 빌드에 포함되어 재컴파일 안 됨 | `.dockerignore` 파일 추가로 해결 (2026-04-01) |
| 배포 시 DATABASE_URL 오류 | `.dockerignore`로 `.env` 제외 후 빌드 단계에서 DB 주소 없음 | `Dockerfile`에 빌드용 더미 DATABASE_URL 추가 (2026-04-01) |
| 간트차트 팝업이 흰 박스로 표시 | frappe-gantt popup 함수가 `""` 반환 시 빈 팝업 표시 | `return false` 로 변경하여 팝업 숨김 처리 |
| 인원 등록 시 4개 필드만 저장 | API Route에 나머지 필드 누락 | POST/PATCH 모두 전체 필드 포함으로 수정 |

---

# **UI/UX 규칙**

## 레이아웃
- 상단 GNB: 파트 탭 네비게이션 (절단파트 / 구매자재파트 / 관리파트)
- 좌측 사이드바: 다크 배경(#1a1f2e), 흰색 텍스트, 현재 메뉴 파란 하이라이트
- 우측 상단: 관리자명 + 연락처 표시
- 콘텐츠 영역: 흰 배경, 상단 페이지 타이틀 + 설명 텍스트

## 컴포넌트 패턴
- 탭: 페이지 내 리스트/등록 전환은 탭 UI 사용
- 테이블: 헤더 회색, 행 구분선, 검색바 좌측 + 총 건수 우측
- 버튼: 등록/추가는 파란색 아웃라인 버튼
- 현재 메뉴: 파란 배경 + 흰 텍스트

---

## 목록(리스트) 구현 표준 패턴

목록을 새로 만들 때는 아래 방식을 기본으로 사용한다. 상단에 항목별 필터 버튼을 나열하는 방식은 사용하지 않는다.

### 1. 서버사이드 페이지네이션 (50건씩)

- API에 `page` 파라미터 추가, `skip` / `take`로 50건씩 반환
- API 응답 형식: `{ data, total, page, totalPages }`
- 하단에 이전/다음 + 페이지 번호 UI 표시
- 필터 변경 시 항상 `page = 1`로 리셋

### 2. 컬럼 헤더 Excel 스타일 필터 (외부 라이브러리 없음)

- 각 컬럼 헤더에 깔때기(Filter) 아이콘 배치
- 클릭 시 `ColumnFilterDropdown` 컴포넌트 표시 (`components/column-filter-dropdown.tsx`)
- 드롭다운 내용: 검색 입력 + 전체선택 체크박스 + 개별 값 체크박스 + 초기화/적용 버튼
- 필터 적용된 컬럼: 깔때기 아이콘 파란색으로 표시
- 드롭다운 위치: `getBoundingClientRect()` + `position: fixed`로 테이블 overflow 영향 없음
- 클릭 외부 감지: `addEventListener("mousedown", ...)` 로 자동 닫힘

### 3. 고유값(Distinct) API 별도 분리

- `/api/[리소스]/distinct` 엔드포인트를 별도 생성
- 컴포넌트 마운트 시 1회 fetch → 각 컬럼의 체크박스 목록으로 사용
- nullable 필드는 `__NULL__` 센티널 값으로 처리, 표시는 "(미지정)" 등 한국어 레이블

### 4. 필터 파라미터 방식

- 다중 선택값은 쉼표(`,`) 구분 문자열로 전달: `?vesselCodes=RS01,RS02`
- API에서 `parseList()` 헬퍼로 파싱 후 Prisma `{ in: [...] }` 조건 적용
- nullable 필드 IN 필터: `__NULL__` 포함 시 `OR: [{ field: null }, { field: { in: nonNullValues } }]`
- 날짜 필드: 날짜 문자열(YYYY-MM-DD)별 gte/lt 범위 조건으로 변환 후 OR 연결

### 5. 상단 바 구성

상단 필터바에는 아래 요소만 배치한다 (컬럼별 필터는 헤더로 이동):

| 요소 | 설명 |
|-|-|
| 텍스트 검색 | 주요 필드 대상 키워드 검색 (insensitive) |
| 필터 전체 초기화 버튼 | 활성 필터가 있을 때만 표시 |
| 새로고침 버튼 | 데이터 재로드 |
| 총 건수 | `총 N건` 우측 정렬 |
| 기타 액션 버튼 | 출력, 등록 등 (우측 끝) |

### 6. 테이블 스타일 기준

| 항목 | 값 |
|-|-|
| 본문 글자 크기 | 12px (`style={{ fontSize: "12px" }}`) |
| 헤더 글자 크기 | 11px (`text-[11px]`) |
| 행 상하 패딩 | `py-1` |
| 체크박스/아이콘 크기 | 13px |

## 기술
- shadcn/ui 컴포넌트 기반
- Tailwind CSS
- 사이드바 현재 메뉴 상태는 `usePathname()`으로 판단

---

## 향후 구현 예정 — 블록 단위 완료 처리 및 아카이브

### 배경
데이터가 누적될수록 메인 DB 조회 성능 저하 방지 및 운영 데이터와 완료 데이터 분리 필요.

### 구현 방향 (미구현, 추후 작업)

**단위:** 호선(프로젝트) 하위 블록 단위로 완료 처리

**처리 흐름:**
1. 블록의 모든 강재 절단 완료 → 담당자가 해당 블록 "완료 처리" 버튼 클릭
2. 해당 블록의 DrawingList, SteelPlan 관련 데이터에 `archivedAt` 타임스탬프 기록
3. 메인 목록에서 자동 숨김 (`WHERE archivedAt IS NULL` 조건으로 필터링)
4. "완료 아카이브" 별도 탭/메뉴에서 조회 가능 (읽기 전용)

**DB 설계 방향:**
- `DrawingList`, `SteelPlan` 모델에 `archivedAt DateTime?` 필드 추가
- 모든 메인 조회 API에 `archivedAt: null` 조건 기본 적용
- 아카이브 조회 API는 별도 엔드포인트로 분리

**참고:**
- 데이터는 실제 삭제하지 않고 숨김 처리 (복원 가능)
- 중소기업 ERP(더존, 영림원 등)의 회계연도 마감 방식과 동일한 개념
- 실제 DB 용량 절감보다는 운영 데이터 경량화(쿼리 범위 축소)가 주목적
- DB가 실제로 느려지는 시점이 오면 그때 물리적 삭제 기능 추가 검토

---

# **11. HTTPS 설정 (무료 — DuckDNS + Caddy)**

> 작성 시작: 2026-05-26
> 목적: HTTP 평문 통신을 HTTPS로 전환하여 비밀번호·데이터 도청 방지. 비용 0원 원칙.

## 11.1 사용 서비스

| 서비스 | 역할 | 비용 |
|-|-|-|
| **DuckDNS** | 무료 서브도메인 제공 + 공인IP 자동 갱신(DDNS) | 무료 |
| **Let's Encrypt** | 무료 HTTPS 인증서 발급 (3개월마다 자동 갱신) | 무료 |
| **Caddy** | 리버스 프록시 — HTTPS 요청 받아 ERP앱(5002)으로 전달, 인증서 자동 관리 | 무료 |

## 11.2 DuckDNS 등록 정보

| 항목 | 값 |
|-|-|
| 계정 (Google 로그인) | banlan21@gmail.com |
| 도메인 | **kotecherp.duckdns.org** |
| 토큰 | `22d8636c-317f-4a3d-81b2-8800f3430803` ⚠️ 외부 공유 금지 |
| 등록일 | 2026-05-26 |
| 공인IP (등록 시점) | 1.213.198.184 |
| 무료 도메인 한도 | 1/5 사용 (계정당 최대 5개까지 가능) |
| **NAS LAN IP** | **192.168.0.54** (포트포워딩 시 대상 주소) |
| DDNS 자동 갱신 | UGOS Pro 내장 DDNS 사용 (5분 간격 자동) |

## 11.3 보안 주의사항

- 토큰은 비밀번호와 동일한 수준의 비밀 정보. **GitHub 등 외부 공개 금지**.
- 토큰 유출 시 → DuckDNS 페이지에서 `recreate token` 버튼 클릭하여 재발급.
- 이 지침서를 GitHub에 올릴 경우 토큰 값은 제거하고 NAS의 `.env` 파일로 분리할 것.

## 11.4 전체 구조도

```
[브라우저]
   ↓ HTTPS (443)
[공유기] ── 포트포워딩 80, 443 → NAS
   ↓
[Caddy 컨테이너] (NAS 안)
   ├─ Let's Encrypt 인증서 자동 발급·갱신
   ├─ HTTPS 암호화 처리
   └─ 내부에서 ERP 앱(3000)으로 전달
[cnc-erp-app] (Next.js)
   ↓
[cnc-erp-db] (PostgreSQL)
```

## 11.5 설치 단계 진행 현황

| 단계 | 내용 | 상태 |
|-|-|-|
| 1 | DuckDNS 가입 및 도메인 발급 (kotecherp.duckdns.org) | ✅ 완료 (2026-05-26) |
| 2 | DuckDNS 자동 업데이트 설정 (UGOS Pro 내장 DDNS) | ✅ 완료 (2026-05-26) |
| 3 | 공유기 포트포워딩 (외부 80→8080, 443→8443) | ✅ 완료 (2026-05-26) |
| 4 | Caddy 컨테이너 docker-compose.yml 추가 | ✅ 완료 (2026-05-26) |
| 5 | Caddyfile 작성 (Let's Encrypt 자동 발급 설정) | ✅ 완료 (2026-05-26) |
| 6 | HTTPS 접속 테스트 및 정상 동작 확인 | ✅ 완료 (2026-05-26) |
| 7 | 기존 5002 포트 외부 노출 차단 (선택) | ⏳ 미진행 (당장 필요 없음) |

## 11.6 최종 적용된 아키텍처 (옵션 C — 공유기 포트 변환 방식)

**채택 이유:** UGOS Pro의 nginx가 이미 80·443을 점유 중이라 직접 점유 불가. UGOS 관리 포트를 변경하면 NAS 관리 페이지 주소가 바뀌고 일시 끊김 발생. 그래서 **공유기에서 외부→내부 포트 변환** 방식으로 우회.

```
[외부 사용자]
   ↓ https://kotecherp.duckdns.org (외부 443)
[회사 공유기]
   ↓ 포트 변환: 외부 443 → NAS:8443, 외부 80 → NAS:8080
[NAS]
   ├─ 80, 443 (UGOS nginx, 그대로 유지) — 관리 페이지 영향 0
   └─ 8080, 8443 (Caddy 컨테이너)
        ↓ HTTPS 종단, 인증서 자동 발급/갱신
        ↓ 내부 reverse_proxy
      app:3000 (Next.js ERP)
        ↓
      db:5432 (PostgreSQL)
```

**변경된 공유기 포트포워드 규칙:**
- 007 ERP-HTTP: 외부 80 → NAS **8080** (내부 포트만 변경)
- 008 ERP-HTTPS: 외부 443 → NAS **8443** (내부 포트만 변경)

**Caddy 컨테이너 포트 매핑** (docker-compose.yml):
```yaml
caddy:
  image: caddy:2-alpine
  ports:
    - '8080:80'
    - '8443:443'
```

**Caddyfile 내용** (`~/erp_namhun/erp/cnc-erp/Caddyfile`):
```
kotecherp.duckdns.org {
    reverse_proxy app:3000
}
```

## 11.7 최종 결과

- ✅ 외부 접속 URL: **https://kotecherp.duckdns.org**
- ✅ HTTPS 인증서: Let's Encrypt (자동 발급/갱신, 3개월 주기)
- ✅ HTTP → HTTPS 자동 리다이렉트 (Caddy 기본 동작)
- ✅ 다른 서비스 영향 0 (UGOS 관리·RaiDrive WebDAV·SMB·ERP 5002 모두 그대로)
- ✅ 비용 0원 (DuckDNS·Let's Encrypt·Caddy 모두 무료)

## 11.8 ✅ 운영 현황 및 관리 메모

> 최종 확인일: 2026-05-28

### Caddy 설정은 `docker-compose.override.yml`로 격리됨

- NAS의 Caddy 서비스는 **별도 파일** `docker-compose.override.yml`에 정의되어 있음
- `docker-compose.yml` 자체는 GitHub와 **동일** (앱·DB·git-sync만 정의)
- Docker Compose는 `up` 시 두 파일을 자동 병합 → Caddy도 함께 실행
- `.gitignore`에 `docker-compose.override.yml`이 등록되어 있어 git-sync로 덮어쓸 위험 없음
- **결론: 기존 배포 명령 그대로 안전하게 사용 가능**
  ```bash
  cd ~/erp_namhun/erp/cnc-erp && sudo docker compose run --rm git-sync && sudo docker compose up --build -d app
  ```

### NAS 측 파일 구성

```
~/erp_namhun/erp/cnc-erp/
├── docker-compose.yml              ← GitHub과 동일 (앱·DB·git-sync)
├── docker-compose.override.yml     ← Caddy 정의 (NAS-only, .gitignore 처리)
├── docker-compose.yml.backup       ← 원본 백업 (변경 전)
└── docker-compose.yml.caddy-included ← 옛날 inline 버전 (참고용)
```

문제 발생 시 복원:
```bash
cp docker-compose.yml.backup docker-compose.yml
```

### 인증서 자동 갱신

- 3개월에 한 번 Caddy가 자동으로 Let's Encrypt에 재발급 요청
- 사용자 개입 불필요
- Caddy 컨테이너만 살아있으면 영구 동작

### 인증서 데이터 보관 위치

- Docker 볼륨 `cnc-erp_caddy_data` (인증서)
- Docker 볼륨 `cnc-erp_caddy_config` (Caddy 설정 캐시)
- `docker compose down`만 해도 볼륨은 보존됨 (`down -v` 명령은 위험)

---

# **12. 사내 도구 포털 HTTPS 적용 (kotechtool.duckdns.org)**

> 작성일: 2026-05-26
> 목적: BOM 변환기 및 사내 도구 서비스(5001번 포트)도 HTTPS로 외부 접속 가능하게 함.

## 12.1 추가된 도메인

| 항목 | 값 |
|-|-|
| 도메인 | **kotechtool.duckdns.org** |
| 용도 | bom-converter 외 회사 사내 도구 포털 |
| 등록일 | 2026-05-26 |
| DuckDNS 도메인 한도 사용 | 2/5 |

## 12.2 bom-converter 컨테이너 정보

| 항목 | 값 |
|-|-|
| 컨테이너 이름 | `bom-converter` |
| 이미지 | `bom-converter` (사용자 자체 빌드) |
| 외부 노출 포트 | 5001 |
| 컨테이너 내부 포트 | **5000** |
| 원래 네트워크 | `bridge` |
| 추가 합류 네트워크 | `cnc-erp_default` ⭐ Caddy와 통신용 |

## 12.3 핵심 작업 4가지 (반복 가능한 패턴)

### ① bom-converter를 cnc-erp_default 네트워크에 합류
```
sudo docker network connect cnc-erp_default bom-converter
```
- Caddy가 컨테이너 이름으로 직접 접근 가능해짐
- ⚠️ **임시 연결** — NAS 재부팅 또는 bom-converter 재배포 시 풀릴 수 있음 → 영구화 작업 별도 필요

### ② DuckDNS에 새 도메인 발급
- duckdns.org 접속 후 sub domain 칸에 `kotechtool` 입력 → add domain
- 토큰은 계정당 1개 공유

### ③ UGOS DDNS에 다중 도메인 등록 (콤마 구분 방식)
UGOS Pro의 DDNS 항목은 1개만 등록 가능. 기존 항목 편집해서:
| 필드 | 값 |
|-|-|
| 등록된 DDNS 도메인 | `kotecherp.duckdns.org,kotechtool.duckdns.org` |
| AccessKey ID | `kotecherp,kotechtool` |
| AccessKey 비밀번호 | (토큰 그대로) |

→ DuckDNS의 다중 도메인 동시 업데이트 기능 활용. 한 항목으로 N개 도메인 동시 관리 가능.

### ④ Caddyfile에 새 도메인 블록 추가
```caddyfile
kotecherp.duckdns.org {
    reverse_proxy app:3000
}

kotechtool.duckdns.org {
    reverse_proxy bom-converter:5000
}
```

### ⑤ Caddy 재시작
```
sudo docker compose restart caddy
```

## 12.4 ✅ bom-converter 네트워크 연결 (영구화 완료)

**현재 상태 (2026-05-28 확인):**
- `bom-converter` 컨테이너가 `cnc-erp_default` 네트워크에 정상 연결됨
- https://kotechtool.duckdns.org 접속 정상 동작 중
- **UGOS Docker GUI 컨테이너 설정의 "네트워크 구성"에 `cnc-erp_default`가 영구 등록되어 있음**
  → NAS 재부팅 후에도 자동 재연결됨 (추가 작업 불필요)

**연결된 네트워크 목록 (UGOS GUI 기준):**

| 네트워크 이름 | 서브넷 | 용도 |
|---|---|---|
| bridge | 172.17.0.0/16 | 기본 Docker 네트워크 |
| cnc-erp_default | 172.21.0.0/16 | Caddy 리버스 프록시 통신 |

**만약 어떤 이유로 끊겼다면 (응급 복구 1줄):**
```bash
sudo docker network connect cnc-erp_default bom-converter
```

## 12.5 향후 사내 도구 추가 시 적용 패턴

새 도구 컨테이너 추가할 때마다 이 5단계 반복:

1. 새 컨테이너 생성·실행 (사용자 작업)
2. `sudo docker network connect cnc-erp_default <컨테이너명>` (Caddy 네트워크 합류)
3. DuckDNS에서 새 서브도메인 발급 (예: `kotechXXX`)
4. UGOS DDNS 항목의 도메인·AccessKey ID 필드에 콤마로 추가 (예: `kotecherp,kotechtool,kotechXXX`)
5. Caddyfile에 블록 4줄 추가 + `docker compose restart caddy`

**소요시간 — 도구 1개당 약 5분.**

DuckDNS 무료 도메인 한도는 5개. 6개 이상 필요할 시 같은 도메인의 경로 분기 사용 (예: kotechtool.duckdns.org/tool6/).

## 12.6 최종 운영 중인 도메인 현황

| 도메인 | 라우팅 대상 | 내부 포트 | 용도 |
|---|---|---|---|
| https://kotecherp.duckdns.org | app (Next.js) | 3000 | CNC ERP 메인 |
| https://kotechtool.duckdns.org | bom-converter | 5000 | 사내 도구 포털 (BOM 변환기 외) |

---

# **13. NAS 외부 접속 URL 모음 + 응급 복구 메모**

## 13.1 외부에서 NAS / ERP 접속 URL

| 용도 | URL | 비고 |
|---|---|---|
| **ERP 메인** | https://kotecherp.duckdns.org | Caddy + Let's Encrypt — 평소 사용 |
| **ERP 직접 (포트 노출)** | http://59.4.248.240:5002 | Caddy 우회, app 직접. HTTP 라 인증서 X |
| **UGOS 관리자 페이지 (외부)** | https://59.4.248.240:9443 | NAS 외부 IP + UGOS HTTPS 포트. 인증서 self-signed (UGREEN) — 브라우저 경고 통과 |
| UGOS 관리자 페이지 (DDNS) | https://kotecherp.duckdns.org:9443 | DDNS 통해. 외부망 차단 시 위 IP 직접 사용 |
| UGOS 관리자 페이지 (UGREENlink) | https://ug.link/kortech | UGREEN 자체 P2P — NAT/방화벽 우회. 가장 robust |
| **SSH** | ssh kortech@59.4.248.240 -p 22 | NAS 외부 IP 직접 |
| **사내 LAN 에서 모두** | 192.168.0.54 (대신 외부 IP) | 같은 LAN 안에서 |

## 13.2 응급 복구 ⚠

**증상: ERP (https://kotecherp.duckdns.org) 접속 안 됨 / 인증서 경고 / UGOS 페이지로 redirect**

원인 (경험 사례): NAS + 공유기 동시 재부팅 후 NAS 의 eth0/eth1 라우팅이 일시 꼬임 → 외부 트래픽이 iptime 우회하고 NAS 직접 도달 → UGOS nginx (NAS:443) 가 받아서 UGOS UI 로 redirect.

**해결 — 1순위: NAS 전원 재부팅 한 번 더**

1. 사내에서 NAS 본체 전원 OFF → 5초 대기 → ON
2. UGOS 부팅 (약 2~3분)
3. `https://kotecherp.duckdns.org` 다시 시도 → Let's Encrypt 인증서로 정상 복귀

**해결 — 2순위: 외부에서 임시 사용**

영구 해결 전까지 임시 URL:
- `https://kotecherp.duckdns.org:8443` (Caddy 직접 포트, 인증서 경고 통과)
- 또는 `http://59.4.248.240:5002` (HTTP, 비암호화)

## 13.3 ❌ 외부에서 절대 하지 말 것

NAS 가 down 되면 외부에서 복구 불가 — 사내 방문 필요.

| 명령/작업 | 위험 |
|---|---|
| `sudo ip link set eth0 down` | NAS 외부 IP 차단 → SSH 끊김 → 외부 복구 불가 |
| UGOS UI 에서 eth0 인터페이스 비활성화 | 동일 |
| UGOS 의 `포트 80을 HTTP 포트로 리디렉션` 체크 해제 | 외부 접속 일부 영향 |
| UGOS 의 UGREENlink 비활성화 | UGREENlink URL 끊김 (https://ug.link/kortech) |

**규칙**: 네트워크 / 인터페이스 / 포트 관련 설정 변경은 **사내 LAN PC** 에서만. 외부에서는 ERP 사용만.

## 13.4 영구 해결책 (사내에서 진행 — 미래 작업)

NAS 재부팅으로 매번 복구되지만, 근본 해결 원하면 사내에서:

**옵션 A**: NAS 의 eth0 (직접 ISP 회선) 비활성화 — 트래픽이 iptime 통해서만 → Project.MD 11.6 옛 설계 복귀  
**옵션 B**: iptables PREROUTING 룰 추가 — eth0 의 외부 443/80 을 Caddy 의 8443/8080 으로 redirect  
**옵션 C**: UGOS UI 의 reverse proxy 메뉴 (있다면) 에서 도메인별 매핑

자세한 절차는 사내 작업 시 결정.

## 13.X 리스트 컴포넌트의 표준 Cascading Filter 패턴 ⚠ 필독

새 리스트(테이블) 컴포넌트를 만들 때 컬럼별 Excel 스타일 필터를 cascading 으로 구현하려면 다음 5단계를 따른다. 직접 distinctValues useMemo 를 작성하지 말 것.

**Cascading 이란**: 컬럼 A 에 필터 적용 시 컬럼 B 의 드롭다운 옵션이 "A 필터 적용 후 데이터" 에서만 unique 값. Excel/SQL WHERE 와 동일.

### 1) accessors 정의 — 컬럼 key → 값 추출 함수 맵

```typescript
import { type ColumnAccessorMap } from "@/lib/cascading-filters";

const accessors = useMemo<ColumnAccessorMap<MyRow>>(() => ({
  강재번호: (r) => r.강재번호,
  규격:     (r) => r.규격 ?? "",
  중량:     (r) => r.중량?.toFixed(1) ?? "",
}), []);
```

### 2) filters 상태

```typescript
const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
```

### 3) distinctValues — cascading 드롭다운 옵션 ⚠ 핵심

```typescript
import { getAllCascadedOptions } from "@/lib/cascading-filters";

const distinctValues = useMemo(
  () => getAllCascadedOptions(rawRows, colFilters, accessors),
  [rawRows, colFilters, accessors],   // ← colFilters 의존성 필수! 빠뜨리면 cascading 깨짐
);
```

### 4) 표 본문 데이터

```typescript
import { getCascadedFilteredRows } from "@/lib/cascading-filters";

const filteredRows = useMemo(
  () => getCascadedFilteredRows(rawRows, colFilters, accessors),
  [rawRows, colFilters, accessors],
);
```

### 5) ColumnFilterDropdown 바인딩

```tsx
<ColumnFilterDropdown
  values={distinctValues[col.key] ?? []}
  selected={colFilters[col.key] ?? []}
  onApply={(sel) => setColFilters(p => ({ ...p, [col.key]: sel }))}
  onClose={...}
  anchorEl={...}
/>
```

### 금지 사항 ❌

- `distinctValues` useMemo 의존성에서 `colFilters` 누락 — cascading 깨짐
- raw 데이터에서만 unique 계산 — 옛 옵션이 다 보임
- `filteredRows` 로부터 옵션 다시 계산 — 자기 자신 필터에 자기 옵션이 갇힘
- 헬퍼 미사용 + 수동 Set 순회 — 빈값/정렬 일관성 깨짐
- `__EMPTY__` 토큰 직접 사용 — `EMPTY_TOKEN` 상수 import

### 빈 값 처리

빈문자열/null/undefined 행은 `EMPTY_TOKEN` 으로 집계 → 드롭다운에 `(값 없음)` 표시. 사용자가 `(값 없음)` 만 체크하면 null 행만 통과.

### 성능

헬퍼는 O(rows × activeFilterCount). 1만 행 / 10컬럼까지 메모이제이션으로 충분. 초과 시 서버사이드 page+filter API 도입 (steel-plan, remnant-list-tab 처럼).

### 서버사이드 cascading (steel-plan / remnant 등 대용량) — 2026-06-09 표준화

데이터가 크고 페이지네이션이 필요한 리스트는 distinct 옵션을 서버에서 계산. 헬퍼: `lib/server-cascading.ts` + `lib/client-cascading.ts`.

#### S1) distinct route — 컬럼 key → QS_KEY + BUILDERS 매핑

```typescript
// app/api/xxx/distinct/route.ts
import { parseList, buildCascadingWhere, nullableInBuilder, dateRangeBuilder } from "@/lib/server-cascading";

const QS_KEY: Record<string, string> = {
  vesselCode: "vesselCodes",
  material:   "materials",
  thickness:  "thicknesses",
  // ...
};

const BUILDERS: Record<string, (vs: string[]) => Record<string, unknown>> = {
  vesselCode: vs => ({ vesselCode: { in: vs } }),
  thickness:  vs => ({ thickness: { in: vs.map(Number) } }),
  status:     vs => ({ status:    { in: vs } }),
  // nullable 컬럼: __NULL__ 토큰 자동 처리
  storageLocation: nullableInBuilder("storageLocation"),
  // 날짜 컬럼: YYYY-MM-DD → 하루 범위 매칭
  receivedAt: dateRangeBuilder("receivedAt"),
};
```

#### S2) 자기 자신 컬럼 제외 where + Promise.all distinct

```typescript
const filters: Record<string, string[]> = {};
for (const [k, q] of Object.entries(QS_KEY)) filters[k] = parseList(sp.get(q));

const where = (excludeKey: string) => buildCascadingWhere(BUILDERS, filters, excludeKey);

const [vessels, materials, ...] = await Promise.all([
  prisma.xxx.findMany({ where: where("vesselCode"), select: { vesselCode: true }, distinct: ["vesselCode"], orderBy: { vesselCode: "asc" } }),
  prisma.xxx.findMany({ where: where("material"),   select: { material: true },   distinct: ["material"],   orderBy: { material: "asc" } }),
  // ...
]);
```

#### S3) 클라이언트 — colFilters 변경 시 distinct 재호출

옵션 A: 기존 `loadDistinct` 에 cf 의존성 추가 (steel-plan-main 패턴)

```typescript
import { serializeColFilters } from "@/lib/client-cascading";

const QS_KEY = { vesselCode: "vesselCodes", /* ... */ };

const loadDistinct = useCallback(async () => {
  const qs = serializeColFilters(colFilters, QS_KEY);
  const res = await fetch(`/api/xxx/distinct${qs ? `?${qs}` : ""}`);
  if (res.ok) setDistinctValues(await res.json());
}, [colFilters]);   // ← 의존성에 colFilters 필수
useEffect(() => { loadDistinct(); }, [loadDistinct]);
```

옵션 B: `useCascadingDistinct` 훅 사용 (debounce + AbortController 내장 — 신규 코드 권장)

```typescript
import { useCascadingDistinct } from "@/lib/client-cascading";

const distinctValues = useCascadingDistinct<Record<string, FilterValue[]>>(
  "/api/xxx/distinct", colFilters, QS_KEY,
);
```

#### S4) NULL 토큰 약속

- nullable 컬럼: 옵션 value `"__NULL__"` + 라벨은 컬럼별 ("(미지정)" / "(없음)" / "미입고" 등)
- `nullableInBuilder` / `dateRangeBuilder` 가 `__NULL__` 토큰을 알아서 `{ field: null }` 또는 `OR` 결합
- 클라이언트 EMPTY_TOKEN (`__EMPTY__`) 과 다름 — 서버사이드는 `__NULL__` 사용

#### S5) 특수 컬럼 (가상/조합 컬럼) 커스텀 빌더

remnant-list 의 `source` 처럼 `P:projectCode` / `V:vesselName` / `__NULL__` 3종 prefix가 한 컬럼으로 합쳐진 경우, BUILDERS 에 인라인 커스텀 빌더 작성:

```typescript
const sourceBuilder = (vs: string[]) => {
  const hasNull      = vs.includes("__NULL__");
  const projectCodes = vs.filter(v => v.startsWith("P:")).map(v => v.slice(2));
  const vesselNames  = vs.filter(v => v.startsWith("V:")).map(v => v.slice(2));
  const ors: Record<string, unknown>[] = [];
  if (hasNull)             ors.push({ AND: [{ sourceProjectId: null }, { sourceVesselName: null }] });
  if (projectCodes.length) ors.push({ sourceProject: { projectCode: { in: projectCodes } } });
  if (vesselNames.length)  ors.push({ sourceVesselName: { in: vesselNames }, sourceProjectId: null });
  if (ors.length === 0) return {};
  if (ors.length === 1) return ors[0];
  return { OR: ors };
};
```

## 13.Y 엑셀스타일 통합 필터 드롭다운 (2026-06-11 도입)

엑셀의 컬럼 필터 드롭다운과 동일한 UX 로 통합. 컬럼 헤더에 깔때기 아이콘 1개만 노출.

### 드롭다운 구성 요소 (위에서 아래로)

1. **정렬 메뉴** — ⬆ 오름차순 / ⬇ 내림차순 / ✕ 정렬 해제 (현재 활성 정렬은 하이라이트)
2. **텍스트 조건 필터** — 시작문자 / 포함 / 같음 / 같지 않음 / 비어있음 / 비어있지 않음
3. **검색창** — 값 빠르게 찾기 (필터링 + 부분 일치)
4. **항목별 체크박스** — (전체선택) + 개별 값 + (값 없음) 토큰
5. **하단 액션** — 초기화 / 적용

### 헤더 표시

- 컬럼 헤더에는 **깔때기 아이콘 1개만** (정렬 아이콘 ↕ 제거)
- 활성 정렬: 깔때기 옆에 작은 ↑/↓ 마커
- 활성 필터: 깔때기 아이콘 파란색

### 적용 우선순위 (작업 레벨)

- **레벨 1+2 — 2026-06-11 완료**
  - 정렬 (오름/내림/해제) + 검색 + 체크박스 + 텍스트 조건(6종)
  - `ColumnFilterDropdown` 단일 컴포넌트 확장 + 적용 19곳 일괄 마이그레이션
- **레벨 3 — 향후 작업 예정**
  - 컬럼 타입(`text` / `number` / `date`) 메타 도입
  - 숫자 필터 (≥, ≤, between, top N)
  - 날짜 필터 빠른선택 (오늘/이번주/이번달/사용자정의 범위)
  - 대상: 강재전체목록·작업일보 같은 큰 리스트 운영 효율 향상
- **레벨 4 — 보류 (over-engineering)**
  - 다중 컬럼 정렬 표준화 / 사용자 정의 조건식 / 필터 프리셋 저장

### 컴포넌트 API (참고)

```typescript
// lib/cascading-filters.ts
export type TextOp = "contains" | "startsWith" | "endsWith" | "equals" | "notEquals" | "empty" | "notEmpty";
export interface TextPredicate { op: TextOp; val: string }
export function applyTextPredicate(value: string, p: TextPredicate): boolean { ... }
export function getCascadedFilteredRowsWithPredicates<T>(
  rows: T[], filters: ColFilters, predicates: Record<string, TextPredicate>,
  accessors: ColumnAccessorMap<T>, excludeKey?: string,
): T[];
```

```tsx
// components/column-filter-dropdown.tsx
<ColumnFilterDropdown
  // 기존
  anchorEl={...} values={...} selected={...} onApply={...} onClose={...}
  // 신규 — 정렬 (옵션)
  sortDir={sortKey === col.key ? sortDir : null}
  onSort={(dir) => handleSort(col.key, dir)}
  // 신규 — 텍스트 조건 (옵션)
  predicate={predicates[col.key] ?? null}
  onPredicate={(p) => setPredicates(prev => ({ ...prev, [col.key]: p }))}
/>
```

### 적용 완료 컴포넌트

**클라이언트 (lib/cascading-filters.ts) — 2026-06-08**

| 컴포넌트 | 데이터 |
|---|---|
| transport-driving-log-tab.tsx | 차량운행일지 |
| charter-usage-tab.tsx | 용차사용대장 |
| payment-main.tsx | 카드사용내역 |
| workers-main.tsx | 인원목록 |
| bom-main.tsx | BOM목록 |
| drawing-table.tsx | 블록강재리스트 (FilterHeader) |
| reports-main.tsx | 작업일보 정규/돌발 (useTableFilter) |

**서버사이드 (lib/server-cascading.ts + lib/client-cascading.ts) — 2026-06-09**

| 컴포넌트 + API | 데이터 | 비고 |
|---|---|---|
| steel-plan-main.tsx + /api/steel-plan/distinct | 강재전체목록 (15컬럼) | nullable + 날짜 |
| steel-plan-main.tsx + /api/steel-plan/heat/distinct | 판번호리스트 (8컬럼) | |
| remnant-list-tab.tsx + /api/remnants/distinct | 잔재(REMNANT/SURPLUS/REGISTERED, 14컬럼) | source 가상컬럼 + base type |

---

## 14. 현장 작업일보 — 정규작업 표준 흐름 + 시간 계산 (2026-06-09 확정)

현장 작업자가 휴대폰에서 `/field/worklog` 로 접속해 절단 작업을 실시간 기록하는 흐름. 작업일보관리·보고서·통계 모든 시간 계산이 이 규칙을 따른다.

### 14.1 정규작업 7단계 흐름

| 단계 | 동작 | 상태 변화 |
|---|---|---|
| 1 | 장비 선택 (플라즈마 1~4 / 가스 1호) | (selectedEq) |
| 2 | **세션 1** — 호선 → 블록 → 작업자 선택 (변경 전까지 유지) | s1.{vesselCode, projectId, operatorId} |
| 3 | **세션 2** — 확정된 도면(`/api/drawings?projectId&confirmed=true`) 선택 → 같은 사이즈 판번호(`/api/steel-plan/heat-options`) 검색 → 실물 판번호 선택 → 특이사항 메모(선택) | drawingId / heatNo / memo |
| 4 | **절단시작** | `CuttingLog.status = STARTED`, `startAt = now` |
| 5 | (선택) **중단** — 사유 선택 후 일시정지 | `status = PAUSED`, `CuttingPause(pausedAt=now)` 생성 |
| 6 | (선택) **재개** | 열린 pause `resumedAt = now`, `status = STARTED` 복귀 |
| 7 | **절단종료** | `status = COMPLETED`, `endAt = now` + DrawingList/SteelPlan 자동 동기화 |

**호선만 있고 블록 없는 케이스**는 현재 미지원 — 추후 데이터 모델 손볼 때 함께 처리.

### 14.2 야간 이월 (다음날 이어서 절단)

오늘 한 장을 다 못 자르고 퇴근할 때:
1. **절단중단** → 사유에서 **"퇴근/야간이월"** 선택
2. 다음날 출근 → 같은 장비에서 그 작업이 PAUSED 로 떠 있음 (SSR `where: { OR: [{ startAt 범위 }, { status: STARTED }] }` 로 stuck 잡힘)
3. 사유 선택(WORK_EXTENSION) 후 **재개** → 이어서 절단 → 종료

> "퇴근/야간이월" reason 의 enum 값은 legacy 호환을 위해 `WORK_EXTENSION` 유지. 라벨만 변경됨.

### 14.3 시간 4구분 — 단일 규칙 ([lib/cutting-time.ts](cnc-erp/lib/cutting-time.ts))

| 항목 | 정의 | 헬퍼 |
|---|---|---|
| **총가동시간** | `(endAt - startAt) - 야간이월시간` | `calcTotalMs(start, end, pauses)` |
| **중단시간** | 일반 중단(장비고장/도면변경/소모품교체/기타) 합 — **퇴근/야간이월 제외** | `calcPauseMs(pauses)` |
| **야간이월시간** | 사유 = `WORK_EXTENSION` 인 pause 합 — 총가동·중단 어디에도 포함 안 됨 | `calcNightOffMs(pauses)` |
| **실가동시간** | `총가동시간 - 중단시간` | `calcActiveMs(start, end, pauses)` |

**예시**: 14:00~17:00 절단(3h) → 17:00 "퇴근/야간이월" 중단 → 익일 09:00 재개 → 11:00 종료(2h)
- endAt - startAt = 21시간
- 야간이월 = 16시간
- **총가동 = 5시간** (= 21 - 16)
- 일반 중단 = 0
- **실가동 = 5시간**

### 14.4 사유 enum (`PauseReason`)

| 값 | 라벨 | 시간 처리 | UI 위치 |
|---|---|---|---|
| `EQUIPMENT_FAILURE` | 장비고장 | 중단시간에 포함 | 사유 드롭다운 |
| `DRAWING_CHANGE` | 도면변경 | 중단시간에 포함 | 사유 드롭다운 |
| `CONSUMABLE` | 소모품교체 | 중단시간에 포함 | 사유 드롭다운 |
| `OTHER` | 기타 (직접입력) | 중단시간에 포함 | 사유 드롭다운 |
| **`WORK_EXTENSION`** | **퇴근/야간이월** | 어디에도 포함 안 됨 (총가동시간에서 차감) | **별도 [퇴근/야간이월] 버튼 (드롭다운 비노출)** |

### 14.4a UI 레이아웃 (`/field/worklog` ongoing 박스)

```
[ 사유 dropdown (4종, STARTED 일 때만) ]
[ OTHER 입력 input (OTHER 선택 시) ]
[──────  절단 중단  ──── ]  ← STARTED 일 때 (사유 선택 시 활성)
[──────  절단 재개  ──── ]  ← PAUSED 일 때
[ 퇴근/야간이월 (좌) ] [ 절단 완료 (우) ]
```
- 퇴근/야간이월 버튼: STARTED 일 때만 활성. PAUSED 일 땐 비활성(재개 후 사용).
- 사유 dropdown 에서 WORK_EXTENSION 제외 — 잘못 골라 미가동시간이 왜곡되는 사고 방지.

### 14.5 새 화면에 시간 표시할 때 ⚠ 필독

직접 `endAt - startAt` 또는 `pauses.reduce` 로 계산하지 말 것. 항상 `lib/cutting-time.ts` 의 4개 헬퍼 사용. 클라이언트 prop 인터페이스는 `pauseMs` + `nightOffMs` 두 값을 받아 처리 (예: `components/reports-main.tsx` 의 `CuttingLog` 인터페이스).

---

## 13.5 DuckDNS 사이트 접속 안 될 때

`https://www.duckdns.org` 404 에러:
- DuckDNS 운영자 측 일시 down (가끔 발생)
- 회사망에서는 추가로 ISP/방화벽 차단 가능
- **영향 없음** — DDNS 갱신은 NAS UGOS 가 자동 처리. 사용자가 사이트 직접 접속할 일 거의 없음
- 정 필요하면 며칠 후 복구 또는 우회 (스마트폰 4G)

---

## 운영 메모

- 외부 IP: **59.4.248.240** (NAS eth0 직접 ISP 할당, 고정으로 유지됨)
- iptime WAN IP: 59.4.224.73 (참고 — NAS 와 별개 회선)
- NAS LAN IP: **192.168.0.54** (사내 PC 접속용)
- 마지막 검증: 2026-06-08