@AGENTS.md

# CNC 절단 파트 ERP 시스템

## 프로젝트 개요
- **회사**: 조선업 CNC 철판 절단 전문 기업 (선박·라싱브릿지 부재 절단)
- **기술 스택**: Next.js · TypeScript · Prisma · PostgreSQL · Docker
- **인프라**: 유그린 NAS DXP4800 Plus (Docker 자체 호스팅)
- **외부 접속**: `https://kotecherp.duckdns.org` (DuckDNS + Let's Encrypt) — 상세는 아래 [네트워크·외부접속 구조](#네트워크외부접속-구조) 참조

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
2. NAS SSH 접속: `ssh kortech@59.4.248.240 -p 34567`
   (포트 22는 열려 있지 않음 — timed out 나면 포트 확인. 옵션은 소문자 `-p`)
3. 배포 명령: `cd ~/erp_namhun/erp/cnc-erp && sudo docker compose run --rm git-sync && sudo docker compose up --build -d app`

## 네트워크·외부접속 구조

> **2026-08-12 실측 확정.** 접속 장애 시 여기부터 볼 것. 저장소 코드만 봐서는 알 수 없는 구조라 여러 번 오진했던 부분.

### 물리 구성 — 공인 IP가 NAS에 직결
```
eth0 : 59.4.248.240/25   ← 공인 IP가 NAS 랜카드에 직접 (dynamic)
eth1 : 192.168.0.54/24   ← 내부망
```
**외부에서 오는 443 트래픽은 공유기를 거치지 않고 NAS로 바로 들어온다.**
→ 접속 장애를 **공유기 포트포워딩 문제로 진단하면 안 된다**(ipTIME 설정은 이 경로와 무관).

### 포트 점유 현황
| 포트 | 누가 | 비고 |
|---|---|---|
| **443** | UGOS 자체 nginx | server_name 이 `redirect.ugreen.com`(UGREENlink) 뿐 → **기본서버로 모든 요청을 먹고 `:9443`으로 307 튕김**. `kotecherp.duckdns.org` vhost 는 **없음** |
| **9443** | 같은 nginx 프로세스 | NAS 관리자 UI. **443과 한 프로세스** |
| **8443** | `cnc-erp-caddy-1` (`8443:443`) | **ERP 실체.** Let's Encrypt 정품 인증서 |
| 8080 | 같은 Caddy (`8080:80`) | |
| 5002 | `cnc-erp-app-1` (`5002:3000`) | ERP 직결(http) |
| 5003 / 5001 | db / bom-converter | |
| 80 | — | **통신사 차단**(ISP 안내페이지 `203.233.19.28`로 튕김). 포기하고 443만 사용 |
| 22 | 외부 차단 | SSH 는 `-p 34567` |

### 443 → ERP 연결 방식 (핵심)
Caddy 는 443 을 가진 적이 없다. **패킷 단계 리디렉션**으로 이어준다:
```bash
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-ports 8443
```
- nginx 를 건드리지 않아 **관리자 UI(9443) 무손상** · 원복은 `-A` → `-D` 로 즉시
- 부작용: 외부 443 의 UGREENlink(`redirect.ugreen.com`) 사용 불가 (DuckDNS 쓰므로 무방)

**⚠ 이 규칙은 재부팅 시 소실된다** — 2026-07 말·08-12 같은 증상 반복의 원인.
→ root crontab 에 영구 등록 완료(2026-08-12):
```
@reboot /sbin/iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-ports 8443
```
(`/sbin/iptables` 존재·`cron` active 확인 완료)

### 접속 장애 시 진단 순서
1. `Resolve-DnsName kotecherp.duckdns.org` → `59.4.248.240` 나오는지 (DuckDNS 정상 여부)
2. 443/8443/5002/9443 포트 열림 확인
3. **443 이 어떤 인증서를 주는지** — `CN=UGREEN` + 307 이면 **리디렉션 규칙 소실**이 원인
4. NAS 에서 `sudo iptables -t nat -S PREROUTING` → 443 규칙 있는지 확인
5. 없으면 위 iptables 한 줄 재실행

**항상 동작하는 우회 주소**: `https://kotecherp.duckdns.org:8443` · `http://59.4.248.240:5002`

### 근본 해결 (미실시 — 사내에서만 할 것)
UGOS nginx 의 443 리슨을 비우고 Caddy 를 `443:443` 으로 바꾸면 리디렉션이 불필요해진다.
**단 443·9443 이 같은 nginx 프로세스라, 설정 실패 시 관리자 UI 까지 동시에 잃는다.**
→ 원격(SSH)에서 시도 금지. 콘솔 접근 가능한 사내에서만.

## 도메인 용어
- **호선**: 프로젝트 단위 식별 코드 (예: RS01, 1022)
- **블록**: 선박 구역 단위 식별 코드 (예: F52P, B40P)
- **네스팅**: 철판 위에 부재를 최적 배치하는 작업
- **강재리스트**: 절단에 필요한 철판의 재질·규격·수량 목록
- **기성**: 완료된 절단 물량에 대해 원청에 청구하는 금액
- **잔재**: 절단 후 남은 철판 조각 (현장잔재/등록잔재/여유원재)
