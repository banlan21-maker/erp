# 로그인·권한 시스템 구현 지침서

> 작성: 2026-06-11
> 상태: **착수 전 — 미결정 사항 정리 중**

본 문서는 ERP 에 로그인·권한 시스템을 도입하기 전에 합의된 내용과 남은 결정사항을 한곳에 모은 것이다.
실제 구현은 미결정 사항이 모두 확정된 후 본 문서의 "구현 단계" 를 그대로 따라간다.

---

## 1. 현재 시스템 상태 (착수 시점)

| 항목 | 상태 |
|---|---|
| 로그인 페이지 | 없음 |
| 인증 라이브러리 (next-auth, jwt, iron-session 등) | 0개 |
| Prisma `User` / `Session` 모델 | 없음 |
| `middleware.ts` | 없음 |
| `cookies()` / `headers()` 호출 | 0건 |
| 외부 접속 | NAS Docker + UGREENlink DDNS 로 외부 노출 중 |

→ **100% 백지 상태**. 어떤 방식이든 자유롭게 설계 가능.

---

## 2. 확정된 결정사항

### 2.1 권한 구조 — 4단계 역할

| 역할 | 코드값 | 설명 |
|---|---|---|
| 시스템최고관리자 | `SUPER_ADMIN` | 본인 전용. 모든 메뉴 + 숨김 메뉴 + 사용자/권한 관리 |
| 경영자 | `EXECUTIVE`   | 모든 일반 메뉴 + 매출/결산/원가 열람. 시스템 설정은 제외 |
| 관리자 | `ADMIN`       | 운영 메뉴 + 거래처/자재. 매출/결산/비자 같은 민감 정보 제외 |
| 현장 관리자 | `FIELD_MANAGER` | 작업 운영 + 조회 중심. 자재/거래처/단가/매출 차단 |
| (비로그인) | — | `app/field/**` 입력 라우트만 접근 가능 |

### 2.2 권한 부여 방식 — 메뉴별 체크박스

- 사용자 추가/수정 시 24개 메뉴 각각에 ✓/✗ 직접 토글
- `User.permissions` 컬럼에 권한 키 배열(JSON)로 저장
- 역할(role) 은 표시·기본값 용도, 실제 권한은 permissions 가 진실
- 새 사용자 추가 시 역할 선택하면 해당 역할의 기본 permissions 가 자동 채워지고 이후 사용자가 ✓/✗ 조정

### 2.3 세션

- 유지 기간: **30일**
- 라이브러리: **iron-session** (자체 구현, 가벼움)
- 비밀번호 해싱: **bcryptjs** (cost 10)

### 2.4 비밀번호 분실 처리

- **SUPER_ADMIN 이 사용자관리 화면에서 직접 리셋**
- 메일 발송·매직링크 의존 없음

### 2.5 초기 계정 (seed 스크립트로 1회 생성)

| 아이디 | 비밀번호 | 이름 | 역할 | 권한 | 비고 |
|---|---|---|---|---|---|
| `admin`  | `1234`   | (본인) | SUPER_ADMIN | **모든 메뉴** | 본인이 로그인 후 직접 비밀번호 변경 예정 |
| `kotech` | `123456` | 공용 운영 계정 | SUPER_ADMIN | **모든 메뉴** | 다른 직원들이 임시로 함께 사용. 본인이 추후 비밀번호 변경 |

> seed 스크립트는 멱등(idempotent)하게 작성. 이미 같은 username 이 있으면 건너뜀.

### 2.6 보안 주의사항 (반드시 기록)

- 초기 비밀번호 `1234` / `123456` 은 **운영 전 변경 필수**.
- 사용자가 직접 변경할 예정이므로 시스템이 강제하지는 않음. 단, 사용자관리 페이지에 "약한 비밀번호" 경고 배지 표시.
- 외부 DDNS 로 노출된 환경이라 초기 비밀번호 상태로 두면 위험. 운영 시작 즉시 변경할 것.

---

## 3. 미결정 사항 (착수 전 결정 필요)

### 3.1 메뉴별 권한 매트릭스 — 역할별 기본값

각 메뉴마다 4단계 역할의 기본 ✓/✗ 를 확정해야 함. **임시 제안** (착수 전 사용자 검토 후 확정):

#### 절단파트 (cnc)
| 메뉴 | SUPER | EXEC | ADMIN | FIELD |
|---|:-:|:-:|:-:|:-:|
| 절단 대시보드 | ✓ | ✓ | ✓ | ✓ |
| 강재입고관리 | ✓ | ✓ | ✓ | ✗ |
| 프로젝트 | ✓ | ✓ | ✓ | ✓ |
| 잔재관리 | ✓ | ✓ | ✓ | ✓ |
| 작업일보관리 | ✓ | ✓ | ✓ | ✓ |
| 출고장 관리 (매출·거래명세서) | ✓ | ✓ | ✓ | ✗ |
| 납품처관리 | ✓ | ✓ | ✓ | ✗ |
| 절단보고서 (매출 포함) | ✓ | ✓ | ✗ | ✗ |

#### 구매/자재 (material)
| 메뉴 | SUPER | EXEC | ADMIN | FIELD |
|---|:-:|:-:|:-:|:-:|
| 구매/자재 대시보드 | ✓ | ✓ | ✓ | ✗ |
| 재고관리 | ✓ | ✓ | ✓ | ✗ |
| 입출고 이력/등록 | ✓ | ✓ | ✓ | ✗ |
| 월별 통계 (지출) | ✓ | ✓ | ✗ | ✗ |

#### 스케줄 (schedule)
| 메뉴 | SUPER | EXEC | ADMIN | FIELD |
|---|:-:|:-:|:-:|:-:|
| 스케줄 생성 | ✓ | ✓ | ✓ | ✗ |
| 스케줄 확인 | ✓ | ✓ | ✓ | ✓ |

#### 관리 (management)
| 메뉴 | SUPER | EXEC | ADMIN | FIELD |
|---|:-:|:-:|:-:|:-:|
| 관리 대시보드 | ✓ | ✓ | ✓ | ✗ |
| 인원관리 (비자·신상) | ✓ | ✓ | ✗ | ✗ |
| 장비관리 | ✓ | ✓ | ✓ | ✓ |
| 운송관리 | ✓ | ✓ | ✓ | ✓ |
| 시설관리 | ✓ | ✓ | ✓ | ✓ |
| 결제관리 (법인카드) | ✓ | ✓ | ✗ | ✗ |
| 거래처 관리 | ✓ | ✓ | ✓ | ✗ |
| 식수 관리 | ✓ | ✓ | ✓ | ✗ |

#### 숨김 메뉴 (SUPER 만)
| 메뉴 | SUPER | EXEC | ADMIN | FIELD |
|---|:-:|:-:|:-:|:-:|
| Excel 프리셋 관리 | ✓ | ✗ | ✗ | ✗ |
| BOM 업체 프리셋 | ✓ | ✗ | ✗ | ✗ |
| 사용자·권한 관리 | ✓ | ✗ | ✗ | ✗ |

→ **검토 필요**: 위 ✓/✗ 중 수정할 부분, 추가/삭제할 메뉴.

### 3.2 사이드바·랜딩의 "노출 vs 클릭 차단" 정책

권한 없는 메뉴를 처리하는 방식 두 가지. **결정 필요**.

- (A) **메뉴 자체를 숨김** — UI 가 깔끔, 사용자는 자기에게 없는 메뉴를 인지 못함
- (B) **메뉴는 회색으로 보이되 클릭 시 "권한 없음" 안내** — 어떤 메뉴가 있는지 알 수 있음

랜딩 페이지 알림 카드도 같은 정책 적용.

### 3.3 비밀번호 정책

- 최소 길이 / 강도 강제 여부
- 변경 주기 강제 여부 (예: 90일마다)
- 동일 비밀번호 재사용 차단 (지난 3회)

> 4명 정도 사용자라 정책을 강제할 실익이 적음. **최소 길이만 4자 이상 정도가 합리적** (1234 가능하도록).

### 3.4 로그인 실패 정책

- 연속 실패 N회 → 계정 잠금?
- 잠금 해제는 SUPER 가 사용자관리에서?
- IP 차단까지 갈지?

> 외부 노출이라 brute-force 보호가 필요하긴 함. **임시 제안**: 5회 연속 실패 시 5분 잠금.

### 3.5 비로그인 입력 라우트 정책 — `app/field/**`

| 라우트 | 비로그인 허용 |
|---|:-:|
| /field (인덱스) | ✓ |
| /field/worklog | ✓ |
| /field/supply | ✓ |
| /field/facility | ✓ |
| /field/payment | ✓ |
| /field/driving-log | ✓ |
| /field/meal/[token] (이미 토큰 기반) | ✓ |

대응 API 도 같은 정책:
- `/api/cutting-logs` (POST), `/api/supply/inbound|outbound` (POST), `/api/facility/*` (POST), `/api/card-usage` (POST), `/api/charter-usage` (POST), `/api/transport-driving-log` (POST), `/api/driving-location` (GET) → **공개 유지**

→ **검토 필요**: 위 API 중 보호 대상으로 옮길 것이 있는지.

### 3.6 세션 만료 처리

- 30일 만료 후: 다시 로그인 페이지로
- 만료 직전 (1일 전쯤) 화면에 경고 띄울지?

### 3.7 동시 로그인 정책

- 같은 계정으로 여러 기기에서 동시 로그인 허용?
- (`kotech` 공용 계정은 사실상 다중 동시 로그인 전제)

> 허용으로 가는 게 운영상 무난.

### 3.8 로그아웃 UI 위치

- 사이드바 하단? 헤더 우측 사용자 아이콘 클릭 시 드롭다운?
- 마이페이지(비밀번호 변경) 진입 위치도 같이 고려

---

## 4. 데이터 모델 (Prisma)

```prisma
enum UserRole {
  SUPER_ADMIN
  EXECUTIVE
  ADMIN
  FIELD_MANAGER
}

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  passwordHash  String           // bcryptjs cost 10
  name          String           // 표시 이름
  role          UserRole         // 표시·기본값용 (실제 권한은 permissions)
  permissions   String[]         // 권한 키 배열 (예: ["cnc.dashboard", "cnc.steel-plan", "mgmt.workers"])
  isActive      Boolean  @default(true)
  lastLoginAt   DateTime?
  failedLoginCount Int   @default(0)        // brute-force 보호용
  lockedUntil   DateTime?                   // 잠금 만료
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String?
}
```

권한 키 네이밍 규칙: `<group>.<menu-slug>` (예: `cnc.dashboard`, `mgmt.workers`, `hidden.user-manage`).

세션 자체는 iron-session 의 쿠키 기반이라 DB 모델 불필요. 만약 "어디서 로그인 중인지" 추적 필요하면 `Session` 모델 추가.

---

## 5. 라우트 분리 정책

### 5.1 보호 대상 (로그인 필수)
- `app/page.tsx` (랜딩) — 자기 메뉴만 보이도록 필터링
- `app/(main)/**` 전체
- `/api/*` 중 위 페이지가 호출하는 모든 라우트

### 5.2 공개 (비로그인 허용)
- `/login`
- `app/field/**`
- `app/field/meal/[token]` (이미 토큰 기반)
- 위 페이지가 호출하는 API 들 (위 3.5 절 참조)

### 5.3 처리 방식
- **`middleware.ts`** — 모든 요청 가로채서 보호/공개 판별
  - 미인증 사용자가 보호 라우트 → `/login?from=원래주소` 로 리다이렉트
  - API 보호 라우트 → 401 JSON 응답
- **페이지 단위 가드** — `getServerSession()` 같은 헬퍼로 페이지에서 `user.permissions` 확인, 권한 없으면 403 페이지

---

## 6. 구현 단계 (Phase A → H)

미결정 사항 확정 후 다음 순서로 진행.

| Phase | 내용 | 추정 시간 |
|---|---|---:|
| **A** | Prisma `User` 모델 + `UserRole` enum + 마이그레이션 SQL | 30분 |
| **A2** | `prisma/seed.ts` 또는 `scripts/seed-users.ts` — admin/kotech 계정 1회 생성 | 20분 |
| **B** | `iron-session` + `bcryptjs` 설치, `lib/session.ts` (세션 유틸), `lib/permissions.ts` (권한 키 상수 + 역할별 기본값) | 40분 |
| **B2** | `/login` 페이지 + `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` API | 1시간 |
| **C** | `middleware.ts` — 라우트 분기 (보호/공개) + 미인증 시 리다이렉트/401 | 30분 |
| **D** | API 가드 헬퍼 `requireAuth(permission)` + 보호 대상 API 라우트에 적용 (점진적) | 1.5시간 |
| **E** | 사이드바·랜딩 페이지 — `user.permissions` 기반 메뉴 필터링 + 알림 카드 필터 | 1시간 |
| **F** | 사용자 관리 페이지 (`/management/users` 또는 숨김 메뉴) — CRUD + 메뉴별 권한 체크박스 + 비밀번호 리셋 + 계정 잠금 해제 | 2.5시간 |
| **G** | 마이페이지 — 본인 비밀번호 변경 (현재 비번 확인 → 새 비번 입력) | 30분 |
| **H** | 일괄 검증 — 로그아웃, 세션 만료, 권한 없는 페이지 직접 URL 접근 차단, 약한 비밀번호 경고 배지 | 1시간 |

**총 약 8~9시간**. 한 세션에 진행 가능.

---

## 7. 환경변수 추가 사항

`.env` 에 다음 추가 필요 (착수 시 알려드림):

```
# iron-session 쿠키 암호화 키 (32자 이상)
SESSION_SECRET=<openssl rand -hex 32 같은 강한 랜덤 문자열>
SESSION_COOKIE_NAME=cnc-erp-session

# 세션 유지 (초)
SESSION_MAX_AGE=2592000   # 30일

# 잠금 정책
LOGIN_FAIL_LIMIT=5
LOGIN_LOCK_MINUTES=5
```

---

## 8. 운영 체크리스트 (착수 직후)

배포 후 SUPER 가 가장 먼저 해야 할 일:

- [ ] `admin / 1234` 로 로그인
- [ ] 마이페이지 → 비밀번호 강한 값으로 변경
- [ ] 사용자관리 → `kotech` 계정도 비밀번호 변경 (또는 `kotech` 사용자에게 변경하라 안내)
- [ ] 다른 직원 계정 추가 시 메뉴별 권한 ✓/✗ 신중히 부여
- [ ] 외부 도메인이 노출되어 있다면 가능하면 사내망/VPN 으로 제한 검토

---

## 9. 결정 보류 메모

이 페이지에 미결정 사항이 정리되어 있음. 사용자가 결정 내려준 부분부터 표시 부분 채워나가면 됨.
완전히 확정된 후 본 문서 제목을 "로그인·권한 시스템 — 구현 완료" 로 바꾸고 § 9 를 삭제한다.
