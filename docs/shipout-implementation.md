# 강재 외부 출고 시스템 구현 지침서

> 작성: 2026-06-11
> 위치: 절단파트 > 강재입고관리 > (전체목록) — 새 흐름 추가
> 관련 모듈: SteelPlan / SteelPlanHeat / DeliveryVendor / TransportVehicle(선택)

---

## 1. 목적

절단·가공부재가 아닌 **원철판(SteelPlan) 을 외부 납품처로 출고**하는 흐름을 추가한다.
출고된 자재는 거래명세표 PDF 로 출력되고, 출고 이력이 시스템에 기록된다.

`ISSUED` (절단장 투입) 와 의미가 다르므로 **별도 상태값으로 분리**한다.

---

## 2. 핵심 흐름

```
[강재전체목록] (필터·페이지네이션 있는 기존 화면)
   │ ① 필터로 후보 좁힘 → 체크박스로 선택 → [+ 출고자재 추가]
   │   페이지를 넘기며 누적 선택 가능
   │
   │ ② (대안) [+ 엑셀로 일괄 추가] — 출고예정 엑셀 업로드 → 자동매칭 → 카트에 적재
   ▼
[출고 카트] (페이지 유지되는 임시 영역)
   │ 카트 안에 자재들 보이고 개별 제거·전체 비우기 가능
   │ [출고장 만들기] 클릭
   ▼
[모달 ① — 판번호 매칭 + 차분 만들기]
   │ 컬럼: 호선·재질·두께·폭·길이·중량·판번호(빈칸)
   │ - 판번호 = 같은 사양의 SteelPlanHeat 목록에서 선택 또는 직접입력
   │   · 직접입력 시 자동으로 SteelPlanHeat 마스터에 추가 (status=SHIPPED)
   │ - 행 체크 → 선택자재 중량 합계 표시 + 적재한도 비교
   │ - [차분 만들기] → 차량정보 입력 (차량번호·운전자·전화·적재한도)
   │   · 적재한도 초과 시 빨간 경고
   │ - 차분 1대 묶이고 다음 자재로 반복
   ▼
[모달 ② — 송장 정보]
   │ 차분별 헤더: [공급처 ▾] [납품처 ▾]
   │   · 공급처 = DeliveryVendor.SUPPLIER 목록에서 선택
   │   · 납품처 = DeliveryVendor.DELIVERY 목록에서 선택
   │ 선택 시 사업자번호/주소/대표자/업태/종목 자동 채움 (수정 가능)
   ▼
[③ 거래명세표 출력]
   │ 차분 1건 = PDF 1장
   │ "거래명세서 출력" 버튼 → PDF 다운로드/인쇄
   │
   │ 출력 완료 시 (트랜잭션):
   │   - SteelPlan : status = SHIPPED_OUT, issuedAt = 출고일
   │   - SteelPlanHeat (선택/생성) : status = SHIPPED
   │   - Shipment / ShipmentVehicle / ShipmentItem 저장
```

---

## 3. 확정된 결정사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 출고 대상 상태 | `RECEIVED` 만 (적치장 재고). REGISTERED / ISSUED / COMPLETED 자재는 출고 후보에서 제외 |
| 2 | 판번호 직접입력 | 자동으로 `SteelPlanHeat` 마스터에 신규 추가 + 상태 `SHIPPED` |
| 3 | 차량 정보 입력 시점 | 차분 만들기 시점에 즉시 입력 (차량번호/운전자/전화/적재한도) |
| 4 | 출고 후 되돌리기 | 가능. 자재는 `RECEIVED` 로 복원, 새로 만든 SteelPlanHeat 는 삭제, 출고장은 "취소" 상태로 기록 (이력 보존) |
| 5 | 거래명세표 양식 | 사용자가 별도 양식 제공 예정. **임시 한국 표준 양식으로 먼저 동작** 시키고 양식 받으면 PDF 생성 부분만 교체 |
| 6 | 차분 적재한도 | 차분 만들기 화면에 한도 입력 칸 + 합계가 한도 초과 시 빨간 경고 + 진행은 가능 (사용자 판단) |
| 7 | 엑셀 양식 | 기존 강재계획 엑셀과 **동일 구조** + 판번호 컬럼 추가. ExcelPreset 패턴 재사용 |
| 8 | 엑셀 컬럼 | 호선 · 재질 · 두께 · 폭 · 길이 · 중량 · 판번호(선택) |
| 9 | 엑셀 자동매칭 규칙 | 판번호가 있으면 SteelPlanHeat 와 판번호 일치 매칭 / 없으면 사양 5개(호선·재질·두께·폭·길이) 매칭 |
| 10 | 엑셀 매칭 결과 표시 | 매칭 ✓ / 미입고 ✗ (빨간색) / 사양 불일치 ✗ (빨간색) / 미입고 자재가 1건이라도 있으면 **경고 모달** 띄움 |

---

## 4. 데이터 모델

### 4.1 enum 추가

```prisma
enum SteelPlanStatus {
  REGISTERED   // 등록 (계획 등록)
  RECEIVED     // 입고완료
  ISSUED       // 절단장 투입 (기존)
  COMPLETED    // 절단완료
  SHIPPED_OUT  // ★ 외부 납품 출고
  SHIPPED_OUT_CANCELLED  // ★ 출고 취소 후 복원 대기 (선택)
}

enum SteelPlanHeatStatus {
  WAITING
  CUT
  SHIPPED   // ★ 외부 출고됨
}

enum ShipmentStatus {
  ACTIVE
  CANCELLED // 출고 취소
}
```

> 단순화: `SHIPPED_OUT_CANCELLED` 는 만들지 않고 출고 취소 시 자재는 `RECEIVED` 로 복원, Shipment 만 CANCELLED 로 표시.

### 4.2 신규 모델

```prisma
model Shipment {
  id            String         @id @default(cuid())
  shipmentNo    String         @unique  // 자동발번 (예: SO-20260611-0001)
  shippedAt     DateTime                // 출고일
  status        ShipmentStatus @default(ACTIVE)
  cancelledAt   DateTime?
  cancelReason  String?
  createdBy     String?                 // 작성자 (로그인 시스템 도입 후 username)
  memo          String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  vehicles      ShipmentVehicle[]

  @@index([shippedAt])
  @@index([status])
}

model ShipmentVehicle {
  id              String   @id @default(cuid())
  shipmentId      String
  shipment        Shipment @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  sequence        Int      // 1, 2, 3 … 차분 순서
  vehicleNo       String   // 차량번호
  driverName      String?
  driverPhone     String?
  loadLimit       Float?   // 적재한도 (kg)
  totalWeight     Float?   // 합계 중량 (kg)

  // 거래명세표 스냅샷 (확정 시점 값 보존 — 마스터 변경되어도 PDF 재출력 가능)
  supplierId      String?
  supplierSnapshot Json?  // { name, bizNo, ceo, address, bizType, bizItem, phone, fax }
  deliveryId      String?
  deliverySnapshot Json?  // 동일 구조

  invoiceNo       String?  // 거래명세서 번호 (자동발번)
  invoicedAt      DateTime?

  items           ShipmentItem[]

  @@index([shipmentId])
}

model ShipmentItem {
  id                  String   @id @default(cuid())
  vehicleId           String
  vehicle             ShipmentVehicle @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
  steelPlanId         String
  steelPlan           SteelPlan       @relation(fields: [steelPlanId], references: [id], onDelete: Restrict)
  steelPlanHeatId     String?
  steelPlanHeat       SteelPlanHeat?  @relation(fields: [steelPlanHeatId], references: [id], onDelete: SetNull)

  // 출고 시점 스냅샷 (자재 마스터 변경되어도 PDF 일관성 유지)
  vesselCode          String
  material            String
  thickness           Float
  width               Float
  length              Float
  weight              Float
  heatNo              String?  // 매칭 판번호 (또는 직접입력 값)
  manualHeatNo        Boolean  @default(false) // 직접입력했는가

  @@index([vehicleId])
  @@index([steelPlanId])
}
```

---

## 5. 라우트 / API 구조

### 5.1 신규 API

```
POST   /api/shipments                              출고장 생성 (트랜잭션)
GET    /api/shipments?from=YYYY-MM-DD&to=...       이력 조회 (필터·페이지네이션)
GET    /api/shipments/[id]                         단건 조회 (차분·자재 포함)
POST   /api/shipments/[id]/cancel                  출고 취소
GET    /api/shipments/[id]/invoice/[vehicleId]     거래명세표 PDF 생성
POST   /api/shipments/excel-upload                 엑셀 업로드 → 매칭 결과 반환
GET    /api/steel-plan/heat-match                  판번호 매칭 조회 — 사양 5개로 같은 사양의 SteelPlanHeat 목록
```

### 5.2 페이지

- `/cutpart/steel-plan` (기존) — UI 만 확장: [+ 출고자재 추가] [+ 엑셀 일괄 추가] [출고장 만들기] 버튼 + 카트 표시
- `/cutpart/shipments` (신규) — 출고장 이력 페이지

---

## 6. 출고 카트 (페이지 유지)

Zustand 또는 React Context 로 만든다.

```ts
interface CartItem {
  steelPlanId: string;
  // 표시용 스냅샷
  vesselCode: string;
  material:   string;
  thickness:  number;
  width:      number;
  length:     number;
  weight:     number;
  // 엑셀 업로드인 경우 사용자가 미리 적은 판번호
  prefilledHeatNo?: string;
}

interface ShipoutCartState {
  items:        CartItem[];
  add:          (items: CartItem[]) => void;   // 중복 자동 제외
  remove:       (steelPlanId: string) => void;
  clear:        () => void;
  totalWeight:  () => number;
}
```

설계 결정: **zustand 사용** (이미 의존성 추가되어 있지 않다면 가벼운 자체 Context 로 대체). 메모리에만 보관 — 새로고침하면 비워짐 (사용자가 카트가 너무 무거워서 잠시 나갔다 와도 유지하려면 sessionStorage 백업).

---

## 7. 엑셀 업로드 + 자동매칭

### 7.1 양식

기존 강재계획 엑셀 양식 + 판번호 컬럼 1개 추가:

| 호선 | 재질 | 두께 | 폭 | 길이 | 중량 | 판번호 (선택) |
|---|---|---|---|---|---|---|

### 7.2 매칭 알고리즘

1. **판번호 있음** → `SteelPlanHeat.heatNo` 일치 검색
   - 매칭 성공: 그 판이 속한 사양의 `SteelPlan` 중 `RECEIVED` 인 것을 카트에 담음
   - 매칭 실패: 미입고 또는 없는 판번호 → 빨간 표시
2. **판번호 없음** → 사양 5개(호선·재질·두께·폭·길이) 매칭
   - 매칭 성공: `SteelPlan` 중 `RECEIVED` 인 것을 수량만큼 카트에 담음 (먼저 들어온 것 우선)
   - 매칭 실패: 미입고 또는 없는 자재 → 빨간 표시

### 7.3 결과 화면

```
┌─ 엑셀 업로드 결과 ────────────────────────────┐
│ 총 12건                                       │
│ ✓ 매칭 9건 (담을 수 있음)                     │
│ ✗ 미입고 3건  ← 빨간색                        │
│                                                │
│ ⚠ 미입고 자재가 3건 있습니다.                  │
│   입고처리 후 다시 시도하거나, 매칭된 9건만   │
│   카트에 담을 수 있습니다.                    │
│                                                │
│ [매칭된 9건만 담기]  [취소]                   │
└────────────────────────────────────────────────┘
```

미입고가 0건이면 경고 모달 없이 바로 [9건 모두 담기] 로 진행.

---

## 8. 거래명세표 PDF (임시 양식)

양식 제공 전 임시로:

- 한국 표준 세금계산서 양식 베이스
- 상단: "거래명세서" + 거래명세서 번호 + 발행일
- 좌측 상단: 공급자 정보 (SUPPLIER 스냅샷)
- 우측 상단: 공급받는자 정보 (DELIVERY 스냅샷)
- 본문: 차분의 자재 리스트 (호선·재질·두께·폭·길이·중량·판번호)
- 하단: 합계 중량 / 차량 정보 / 운전자

라이브러리: `@react-pdf/renderer` (서버 사이드 PDF 생성, react-pdf 와 다름).

추후 사용자 양식 받으면:
- 양식 이미지 → 배경에 깔고 텍스트 좌표 매핑
- 빈 양식 PDF → pdf-lib 로 텍스트 채우기

---

## 9. 트랜잭션 — 출고 확정 시

```ts
await prisma.$transaction(async (tx) => {
  // 1. Shipment + ShipmentVehicle + ShipmentItem 저장
  // 2. 각 SteelPlanItem 마다:
  //    a. heat 매칭/직접입력 처리
  //       · 기존 마스터에 있으면: 그 heatId 사용
  //       · 직접입력이고 마스터에 없으면: 신규 생성 (status=SHIPPED)
  //       · 기존 마스터에 있는데 직접입력으로 적힌 경우: 마스터 status=SHIPPED 로 변경
  //    b. SteelPlan.status = SHIPPED_OUT, issuedAt = shippedAt
  //    c. SteelPlan.storageLocation = null (적치장 떠남)
  // 3. shipmentNo, invoiceNo 자동발번
});
```

발번 규칙:
- `shipmentNo` = `SO-YYYYMMDD-NNNN` (당일 시퀀스)
- `invoiceNo` = `INV-YYYYMMDD-NNNN` (차분당 1개)

---

## 10. 출고 취소 (Cancellation)

```ts
POST /api/shipments/[id]/cancel  { reason }

await prisma.$transaction(async (tx) => {
  // 1. Shipment.status = CANCELLED, cancelledAt, cancelReason
  // 2. 모든 ShipmentItem 의 SteelPlan 을 RECEIVED 로 복원
  //    · 단, 그 동안 다른 사용자가 상태 변경했으면 알림 (예: ISSUED 로 다시 갔으면 복원 불가)
  // 3. ShipmentItem 마다 신규 생성한 SteelPlanHeat 가 있으면 삭제 (manualHeatNo=true 인 경우)
  //    기존 마스터에서 끌어온 것은 status 그대로 둠 (이미 절단된 것일 수 있음)
});
```

거래명세표는 보존 (취소되어도 PDF 재출력 가능, 단 워터마크 "취소"). 

---

## 11. 구현 단계 (Phase A → I)

| Phase | 내용 |
|---|---|
| **A** | Prisma 스키마 — enum 2개 확장 + Shipment/Vehicle/Item 3개 모델 + 마이그레이션 |
| **B** | 출고 카트 상태 관리 + 강재전체목록에 [+ 출고자재 추가] 버튼 + 카트 표시 |
| **B2** | 엑셀 업로드 API + 자동매칭 로직 + 결과/경고 모달 + 카트 일괄 추가 |
| **C** | 신규 API 작성 (shipments CRUD, heat-match 검색, cancel) |
| **D** | 모달 ① — 판번호 매칭 + 차분 만들기 (적재한도 + 차량정보) |
| **E** | 모달 ② — 송장정보 (공급처/납품처 자동입력) |
| **F** | 출고 확정 트랜잭션 (상태 전환 + Heat 자동생성/업데이트) |
| **G** | 거래명세표 PDF (임시 한국 표준양식) |
| **H** | `/cutpart/shipments` 페이지 — 이력 조회 + 출고취소 + PDF 재인쇄 |
| **I** | ultracode 다각도 검증 + typecheck + commit + push |

---

## 12. 사이드바 메뉴 변경

- 절단파트 그룹에 **"출고장 관리"** 메뉴 추가 (`/cutpart/shipments`)
- 강재입고관리 페이지는 그대로 유지하되 출고 관련 버튼 추가

---

## 13. 비고

- 거래명세표 양식은 사용자가 제공해주실 때까지 임시 한국 표준양식 사용. 양식 받으면 G Phase 만 재작업.
- 출고 시스템 도입 후 [docs/login-implementation.md](./login-implementation.md) 의 권한 매트릭스에 "출고장 관리" 메뉴 추가 필요 (EXEC, ADMIN 까지 허용 권장. FIELD 는 조회만).
