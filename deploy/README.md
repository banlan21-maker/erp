# 배포 구성 백업 — 외부 접속(HTTPS) 복구 절차

> 이 폴더는 **NAS 에만 존재하고 git 으로 추적되지 않는 배포 파일의 백업본**이다.
> NAS 장애·재설치 시 여기 있는 두 파일이 없으면 HTTPS 접속 구조를 처음부터 다시 만들어야 한다.
> 네트워크 전체 구조는 [`CLAUDE.md` → 네트워크·외부접속 구조](../CLAUDE.md) 참조.
>
> **파일명이 `.example` 인 이유**: 실제 파일명(`Caddyfile`, `docker-compose.override.yml`)
> 그대로 저장소에 넣으면, NAS 에 같은 이름의 추적되지 않는 파일이 이미 있어
> 다음 `git pull` 이 *"untracked working tree file would be overwritten"* 으로 **실패**한다
> (= 배포 중단). 이름을 달리해 충돌 없이 백업만 한다.

## 현재 운영 구조

```
인터넷 ──443──▶ [iptables REDIRECT → 8443] ──▶ Caddy ──┬─▶ app:3000           (ERP)
                                                        └─▶ bom-converter:5000 (BOM 변환기)
```

| 도메인 | 뒷단 | 용도 |
|---|---|---|
| `kotecherp.duckdns.org` | `app:3000` | CNC 절단 ERP |
| `kotechtool.duckdns.org` | `bom-converter:5000` | BOM 파일 변환기 |

Caddy 는 두 도메인의 **Let's Encrypt 인증서를 자동 발급·갱신**한다(사람 개입 불필요).

## 파일 목록

| 백업본 | NAS 실제 경로 | 역할 |
|---|---|---|
| `Caddyfile.example` | `~/erp_namhun/erp/cnc-erp/Caddyfile` | 도메인별 프록시 규칙 |
| `docker-compose.override.yml.example` | `~/erp_namhun/erp/cnc-erp/docker-compose.override.yml` | Caddy 컨테이너 정의 |

## 복구 절차 (새 NAS / 재설치 시)

1. 저장소 클론 후 두 파일을 **원래 이름으로** 복사
   ```bash
   cd ~/erp_namhun/erp/cnc-erp
   cp deploy/Caddyfile.example                    ./Caddyfile
   cp deploy/docker-compose.override.yml.example  ./docker-compose.override.yml
   ```

2. 컨테이너 기동 (override 는 자동 병합됨)
   ```bash
   sudo docker compose up -d
   ```

3. **외부 443 → 8443 리디렉션** 적용 (NAS 의 80/443 은 UGOS nginx 가 점유)
   ```bash
   sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-ports 8443
   ```

4. **재부팅 대비 영구화** — `sudo crontab -e` 에 추가
   ```
   @reboot /sbin/iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-ports 8443
   ```

5. 확인
   ```bash
   curl -sI https://kotecherp.duckdns.org | head -1     # HTTP/2 200 이면 정상
   ```

## 주의사항

- **`docker-compose.yml`(저장소 추적본)에 Caddy 를 직접 넣지 말 것.** override 분리 덕분에
  `git-sync`(git pull)가 충돌 없이 동작한다.
- **`caddy_data` 볼륨을 지우지 말 것.** Let's Encrypt 인증서가 여기 저장된다. 지우면 재발급되는데
  발급 횟수 제한(주당 5회/도메인)에 걸릴 수 있다.
- **`bom-converter` 는 이 compose 프로젝트 소속이 아니다.** 별도로 떠 있는 컨테이너를
  Caddy 가 컨테이너 이름으로 찾으므로, **같은 Docker 네트워크**에 있어야 한다.
  `kotechtool.duckdns.org` 가 502 를 내면 네트워크 연결부터 확인할 것.
- **80 번 포트는 통신사가 차단**한다(ISP 안내 페이지로 튕김). 443 만 사용한다.
