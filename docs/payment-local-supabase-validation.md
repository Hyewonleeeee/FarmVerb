# 구매 안정화: 실제 로컬 Supabase 검증 결과

검증일: 2026-10-14 (KST). 앱·migration 기준: `32ae5f8efcdf07dfc2aed77dbd79f6bb14e2531a`, 브랜치 `codex/p1-purchase-stability`.

**PASS — 무료 Colima/Docker + Supabase CLI 환경을 구성했고 실제 Auth/PostgREST API 검사 37/37이 통과했다.** 기존 migration 3개부터 001 → 002 → 003을 순차 적용했다. 각 단계의 commit 뒤 구 SDK 쿼리와 신규 RPC를 실제 HTTP로 실행했다. 앱 코드·migration은 변경하지 않았다. 이전 139개 회귀 테스트는 이번에 반복 실행하지 않았으며, 이 37개는 별도의 실제 API 검사다.

이 **로컬 검증 단계에서는** 운영 DB, Lemon Squeezy 주문, 실제 고객/본인/NFR 데이터, Google 수집 API를 사용하지 않았고 클라우드 staging 생성·운영 migration·main 병합·Vercel 배포도 하지 않았다. 이후 같은 날 운영 001→002→003 적용과 `32ae5f8` Production 전환을 완료했다. 그 결과는 [운영 실행 기록](payment-operations.md)에 있으며 이 로컬 테스트 결과와 구분한다. 2026-11-13 현재 Production 상태를 새로 확인한 문서는 아니다.

## 실행 환경과 격리

| 항목 | 실제 사용값 |
| --- | --- |
| 호스트 | macOS arm64 14.8.9, Node 24.8.0 |
| 런타임 | Colima 0.10.3 / Lima 2.2.0, Docker CLI 29.8.0 / Engine 29.5.2 |
| 전용 VM | `farmverb-p1`, 2 CPU / 6 GiB / 30 GiB 디스크 설정; 기본 Docker context 변경 없음 |
| Supabase CLI | 2.120.0 (npm 캐시 설치, 앱 의존성 변경 없음) |
| PostgreSQL | `supabase/postgres:17.11.0.004`, 서버 PostgreSQL 17.11 |
| API | PostgREST v16.4, GoTrue v2.197.0, Kong 2.8.1 |
| 프로젝트/위치 | `farmverb-p1-local` / `/private/tmp/farmverb-local-supabase.jEOXke` |
| 바인딩 | API `127.0.0.1:55321`, DB `127.0.0.1:55322`, 로컬 메일 UI `127.0.0.1:55324` |
| 제외한 서비스 | Realtime, Storage, imgproxy, Studio, postgres-meta, Edge Runtime, logflare/vector, Supavisor |

Docker network `farmverb-p1-loopback`의 host binding을 `127.0.0.1`로 지정했고 실제 published port도 확인했다. 원격 Supabase 링크와 운영 `.env.local` 로드는 없다. Auth가 관리하는 실제 `auth.users`와 기본 `anon` / `authenticated` / `service_role`을 사용했다. service_role의 BYPASSRLS=true, 브라우저 역할의 BYPASSRLS=false도 확인했다.

검증 스크립트 [payment-local-api-check.mjs](../scripts/payment-local-api-check.mjs)는 `http://127.0.0.1:<port>`의 `/auth/v1/`, `/rest/v1/`만 호출하고 redirect를 거부한다. 로컬 익명 키로 A의 비밀번호 로그인을 수행하고 `getUser()`로 실제 사용자 JWT·authenticated 역할을 확인했다. 테스트 계정 두 개의 이메일은 `.invalid` 주소이고, 관리자 `email_confirm: true` 경로를 사용했다.

주문 ID는 `audit-local-<UUID>-...`이며 저장소의 정상 variant/상품 조합을 사용한다. 합성 행의 `test_mode=false`는 격리 DB 안에서 Live 분기를 검증하기 위한 값이다. 실제 결제를 뜻하지 않는다. 실제 라이선스 키나 다운로드 URL은 넣지 않았다.

## 단계별 실제 결과

| 단계 | 실행 | 결과 |
| --- | --- | --- |
| BASELINE | `202607130001_create_purchases.sql` → `202609210001_create_purchase_account_claims.sql` → `202609210002_reload_postgrest_schema.sql` | 성공. 기존 25컬럼(16+9), 실제 Auth/기본 역할 사용 |
| BASELINE API | 기존 SDK upsert·이메일 연결, 중복 주문, 보존용 합성 fixture | **4/4 PASS**. 보호 전에는 A의 refunded 주문이 B/paid로 바뀌는 동작을 실제 재현한 뒤 합성 행만 복원 |
| 001 | `202610130001_payment_event_recovery.sql` 전체 적용 후 API | **11/11 PASS**. 이 단계부터 구 쓰기 보호 활성화. 002의 분석 컬럼/RPC가 아직 없다는 것도 확인 |
| 002 | `202610130002_analytics_checkout_recovery.sql` 전체 적용 후 API | **11/11 PASS**. 보호 유지, 실제 분석 lease/RPC 권한 확인 |
| 003 | `202610130003_purchase_write_guards.sql` 전체 적용 후 API | **11/11 PASS**. 최종 구·신 쿼리 혼재 보호 유지 |
| 최종 catalog | [payment-schema-check.sql](../scripts/payment-schema-check.sql), 관리자 읽기 전용 transaction | **PASS**. 48컬럼, 3표 RLS·restrictive policy, service grants, RPC, guard 검사 |
| 운영 비교용 SQL | [payment-data-snapshot.sql](../scripts/payment-data-snapshot.sql), 로컬 합성 데이터만 조회 | **PASS**. 실제 PostgreSQL에서 실행, 결과 CSV 비공개 저장 |
| 도구 안전성 | 외부 origin이 든 가짜 설정으로 실행 | **PASS**. `LOOPBACK_URL_REQUIRED`로 HTTP 요청 및 manifest 생성 전 중단 |

모든 SQL은 파일 전체를 `psql -X --set=ON_ERROR_STOP=1`로 실행했고 파일 내부 transaction을 유지했다. migration 실패가 발생하지 않아 실제 실패한 migration의 복구를 이번 환경에서 실행한 것은 아니다. Supabase CLI의 원격 migration 이력과 연결하지 않고 파일을 명시적으로 적용했다.

37개는 단계별 검사항목의 합계(4+11+11+11)다. 반복 단계의 같은 항목과 내부 복수 assertion이 있으므로 37개의 서로 다른 고객 여정이라는 뜻은 아니다. Next.js 서버 전체를 띄운 E2E가 아니라 **구 API의 SDK 쿼리 형태와 신규 DB RPC를 실제 Supabase API로 검증**한 결과다.

## 두 BLOCKER 및 권한 검증

| 검증 | 실제 확인 결과 |
| --- | --- |
| 구 My Account의 대량 이메일 UPDATE | service_role로 `user_id IS NULL`, 이메일, paid/partial_refund, Live, variant 조건의 PATCH 실행. `claim_review`는 미연결 유지, 정상 email_allowed 행은 B에게 연결. 요청 전체를 실패시키지 않음 |
| 구 웹훅의 직접 upsert | 명시적 PK·연결 분류 없이 `onConflict: lemon_order_id` 호출. refunded/partial_refund/fraudulent 각각에 B/paid를 다시 제출해도 A와 기존 상태 유지. 반복 upsert의 반환 ID 동일 |
| 정확한 claim 연결 | 증거 없음, 다른 사용자, 다른 variant, 다른 order는 미연결 유지. 정확히 소비된 order/user/variant claim은 연결 허용 |
| 신규 RPC 및 동시성 | 같은 주문 반복 저장은 1행. 실제 HTTP 두 요청으로 paid/refunded 동시 저장 후 A/refunded 유지. 한 번의 스케줄 결과이며 부하·모든 경합 순서 검증을 뜻하지 않음 |
| 상태·identity 보호 | failed/잘못된 금액·통화 snapshot으로 paid 주문이 후퇴하지 않음. 기존 variant 변경은 SQLSTATE 22023으로 거부 |
| 웹훅 수신함 | 동시 lease 2개 중 1개만 획득. `ignoreDuplicates` upsert는 null 반환 후 기존 행·lease·attempt 보존. 합성 lease 만료 후 새 token으로 재획득 |
| 분석 lease | 다른 사용자 false, 올바른 사용자의 동시 요청 중 true 1개. 합성 lease 만료 후 재획득 가능. Google 전송/수신 검증 아님 |
| anon / authenticated | 실제 존재하는 purchases/claims/inbox 행이 보이지 않음. INSERT는 42501, UPDATE 후 서비스 재조회로 원본 불변 확인. 각 역할의 세 RPC 호출도 42501이고 행/lease 불변 (001에는 분석 RPC가 아직 없음) |
| service_role | 정상 SELECT/INSERT/UPDATE 및 RPC 성공. 세 테이블 DELETE/TRUNCATE 권한 false는 실제 catalog로 확인. 서비스 키의 광범위한 일반 신뢰 모델을 제거한 것은 아님 |
| baseline 보존 fixture | 소유자 있는/없는 구매 2행의 기존 비교 필드 14개와 claim 1행의 기존 9필드를 단계마다 대조해 동일. 실제 운영 8/13행 보존을 실행·검증한 것은 아님 |

최종 guard는 postgres 소유 SECURITY DEFINER, `search_path=pg_catalog, pg_temp`이고 무조건 BEFORE INSERT/UPDATE에 활성화되어 있었다. 세 공개 RPC는 SECURITY INVOKER이며 서비스 역할만 실행 가능했다. browser RPC 권한 오류를 schema cache 미반영 오류로 오인하지 않도록 서비스 readiness probe를 먼저 실행했다.

## 실행 및 재사용

원본 자격증명 파일 `status.json`, 합성 계정 비밀번호·claim hash를 포함한 `run.json`, CLI 로그는 위 임시 프로젝트 폴더에 비공개로 보관한다. **원문을 채팅·Git·보고서에 붙이지 않는다.** 두 JSON 파일은 mode 600이며 검증 스크립트가 이를 확인한다. 임시 폴더는 OS 정리로 없어질 수 있으므로 재현 가능한 코드와 절차를 저장소에 남겼다.

검증 종료 당시 이 로컬 DB에는 003까지 적용되어 있었다. 단계 전체를 다시 확인하려면 별도의 빈 로컬 프로젝트/manifest를 준비해야 한다. 기존 최종 DB에 baseline 테스트나 001 전체를 다시 실행하지 않는다. 아래는 2026-10-14 macOS에서 사용한 경로와 명령 패턴이며 현재도 그 임시 환경이 존재한다고 보장하지 않는다. Windows에서는 [인계 안내](payment-operations.md#windows-인계)에 따라 WSL2/Linux 파일시스템과 Docker Linux 컨테이너를 사용하고 `0600` 검사를 유지한다.

```sh
farmverb_local_dir=/private/tmp/farmverb-local-supabase.jEOXke
farmverb_local_cli=/Users/hyewon/.npm/_npx/0e23c24576954b26/node_modules/.bin/supabase
export DOCKER_HOST=unix:///Users/hyewon/.colima/farmverb-p1/docker.sock

# 지정한 로컬 DB에만 파일 하나를 적용. 각 결과가 성공한 뒤 다음 단계로 이동.
docker --context colima-farmverb-p1 exec -i supabase_db_farmverb-p1-local \
  psql -X -U postgres -d postgres --set=ON_ERROR_STOP=1 --quiet \
  < supabase/migrations/202610130001_payment_event_recovery.sql

# 최초 baseline 적용 뒤 baseline, 각 migration 적용 뒤 001/002/003으로 실행.
node scripts/payment-local-api-check.mjs --stage 001 \
  --config "$farmverb_local_dir/status.json" --manifest "$farmverb_local_dir/run.json"
```

처음부터 재구성할 때는 무료 Colima + Docker CLI와 `supabase@2.120.0`을 준비하고 `supabase init --workdir <빈 로컬 폴더>`를 실행한다. 고유 project_id, 충돌 없는 포트, seed 비활성화를 지정하고 로컬 폴더를 VM에 마운트한다. loopback host binding을 가진 Docker network로 `start`한 뒤 `status -o json`을 `umask 077`로 private 파일에 저장한다. repo의 운영 환경파일이나 원격 DB link는 사용하지 않는다. 기본 Supabase schema 위에 위 표의 baseline 파일 3개부터 순서대로 적용한다. [공식 로컬 개발 안내](https://supabase.com/docs/guides/local-development/cli/getting-started), [Colima](https://github.com/abiosoft/colima).

기존 환경 재시작 명령은 다음과 같다. 이는 localhost 컨테이너 시작이며 원격 DB 변경이 아니다.

```sh
colima start farmverb-p1 --activate=false --ssh-config=false
DOCKER_HOST=unix:///Users/hyewon/.colima/farmverb-p1/docker.sock \
  "$farmverb_local_cli" start --workdir "$farmverb_local_dir" \
  --network-id farmverb-p1-loopback \
  --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

검증 후 `supabase stop --project-id farmverb-p1-local`을 전용 DOCKER_HOST로 실행하고 `colima stop farmverb-p1`로 VM을 종료했다. `--no-backup`, `--all`, 전체 Docker prune은 사용하지 않았다. 합성 DB의 전용 Docker volume이 보존된 것을 확인했으며 운영 데이터는 없다. 설치한 CLI/Colima는 재사용할 수 있다.

## 로컬 검증 범위 밖의 사항과 후속 운영 결과

**당시 로컬 검증 BLOCKER는 없었다.** 같은 날 별도 승인으로 운영 배포를 완료했지만, 로컬 37개 통과만으로 아래 모든 운영 항목이 검증된 것은 아니다.

| 분류 | 미확인 사항 / 필요한 조치 |
| --- | --- |
| 클라우드 Supabase | 운영 PostgreSQL/Auth/PostgREST 버전·설정, 추가 policy/grant/trigger/Auth hook, schema cache 재로딩 시간, API proxy·rate limit·pooler 차이는 이 로컬 환경과 동일하다고 보장하지 않음. 운영 읽기 전용 preflight와 적용 후 catalog 검사를 기록 |
| 운영 데이터 | 후속 2026-10-14 운영 snapshot에서 8구매=Test 3+본인 4+NFR 1, claim 13의 기존 handle·hash 보존을 확인했다. 이는 별도 운영 검증 결과다. 이후 신규 주문은 증가 가능하며 미매핑 1건과 NFR 관계는 추정하지 않음 |
| 백업·복구 | 7일 physical backup은 사용자 확인 정보. 실제 복원 권한·복원 지점·RTO 및 복원 리허설은 별도 확인. 이 로컬 테스트로 클라우드 백업 복구가 증명되지 않음 |
| Vercel | 이 로컬 검증 범위 밖. 후속 운영 절차에서 `32ae5f8` 수동 Production 전환·domain 연결·Disabled 유지와 `2260fa1` Production Staged fallback을 확인했다. 현재 SHA/설정·배포물 가용성은 새로 확인하지 않음 |
| 앱·외부 서비스 | 실제 Next.js 라우트 전체, OTP 이메일/세션 쿠키, 11상품·번들의 실제 결제, Lemon API·서명된 웹훅 전달, 다운로드·라이선스, Google 수신·광고 attribution은 이번 API 테스트 범위 밖. 기존 mock/PGlite 결과 및 향후 승인된 결제 검증과 구분 |
| 장애·부하 | 실제 Vercel 배포 실패·진행 중 요청 전환, 네트워크 단절/클라우드 장애, 지속 부하·장시간 경합은 이번 환경에서 실행하지 않음 |

이후 [운영 절차](payment-operations.md)에 따라 자동 domain 배정을 Disabled로 저장하고 fallback 준비 → backup/snapshot 확인 → 운영 001→002→003·catalog/기존 행 보존 확인 → main 반영·Production 수동 전환을 완료했다. 이 절차를 Windows 인계 때 반복하지 않는다. 특히 SQL Editor 적용이 migration history에 등록되지 않았다는 이유로 운영 migration을 재실행하지 않는다. 실제 결제·서명 웹훅·인증된 다운로드/라이선스·Google 수신은 당시 배포 확인 범위에 포함되지 않았다.

## migration 파일 식별

실행한 파일은 `32ae5f8`과 동일하다. SHA-256:

| 파일 | 해시 |
| --- | --- |
| 202610130001_payment_event_recovery.sql | `6bddfe1beb6e149e25e4d9ad1fb8fe304e68b7e2c81dd9c9a15126386ad04fc7` |
| 202610130002_analytics_checkout_recovery.sql | `8d7f4edc07ae25d60b7c5585d77303a3501acf2865f78e674e9a16a9c49a7c9a` |
| 202610130003_purchase_write_guards.sql | `897bff145caa015895aeb78a9854f00f7f941f31033245761d4760b167b53bcf` |
