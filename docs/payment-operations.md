# 결제 안정화 배포·운영 절차

이 문서는 F01–F07 수정 코드의 배포 기록과 장애 대응 절차다. **2026-10-14에는 초기 fallback 생성 실패 후 재개하여 운영 migration 001→002→003과 `32ae5f8` Production 전환을 완료했다.** 실제 결제·라이선스 변경·주문 복구는 실행하지 않았다. 아래 준비·중단·재개 기록은 시간순 이력이다.

2026-11-13 Windows 인계 시점의 원격 `main`은 `c129647`이며 `32ae5f8`과 이후 회원가입 전환 변경을 포함한다. 이는 Git 상태이며 **현재 Production SHA를 오늘 재확인했다는 뜻이 아니다.** 배포 ID·도메인·설정·집계 수치는 별도 표시가 없으면 2026-10-14 확인 기록이다.

## 변경 구조와 순서

1. 서명·이벤트명·Live Mode·store 검증을 통과한 웹훅을 `payment_webhook_events`에 먼저 기록한다. 원본 payload/서명/원문 claim 토큰은 저장하지 않는다. 정규화 주문에는 고객 이메일이 포함되므로 이 테이블도 고객 데이터로 관리한다.
2. 중복 event key와 2분 lease로 처리 작업을 제한한다. `purchases.lemon_order_id` 유일성과 원자적 SQL 병합으로 중복 주문을 처리한다. 현재 `001`과 `003`에 포함된 동일한 DB 쓰기 guard는 신규 RPC와 구 API의 직접 INSERT/UPDATE/upsert에 공통으로 적용해 기존 소유자·환불 상태를 보존한다. 충돌한 필드를 기존 값으로 유지하므로 HTTP 성공만으로 요청한 변경이 저장됐다고 판단하지 않는다.
3. 새 계정 claim은 24시간 유효하다. 수신 시각 대신 서명된 **주문 생성 시각**으로 유효기간을 확인하므로 지연 웹훅을 복구할 수 있다. 생성 시각 하한에는 작은 시계 오차 허용치가 있고 만료 상한은 유지한다.
4. 신규 앱은 유효하지 않은 claim을 `claim_review`로 보류한다. 결제 이메일이 같아도 자동 지급하지 않는다. claim 없는 정상 주문의 이메일 연결은 확인된 이메일과 `email_allowed` 조건을 모두 요구한다.
5. 미등록 variant는 `quarantined/unmapped_variant`에 남긴다. 상품 매핑 검토·배포 후 같은 이벤트를 재처리한다. 임의 상품 지급은 하지 않는다.
6. 새 체크아웃의 claim만 분석 복구 대상으로 기록한다. My Account가 본인 소유의 Live·paid·공식 variant 주문을 조회하고 정확한 주문 ID를 `transaction_id`로 사용한다. 60초 lease, 채널별 callback ACK, 기존 로컬 중복 표식을 함께 사용한다.
7. 라이선스 키의 필수 소유권 검증은 유지하고, 부가 상품명·기기 조회 장애만 분리한다. 저장소 장애는 계정별 탭 메모리 장바구니로 대체한다.

F01(계정 연결), F03(미등록 variant), F04(복구)는 같은 수신함과 F02의 원자적 주문 저장에 의존한다. F06은 계정 claim과 검증된 주문을 사용한다. 아직 적용하지 않은 환경은 현재 `001`→`002`→`003` SQL migration을 먼저 적용한 뒤 신규 앱을 배포한다. 이전 SQL을 이미 적용한 환경은 아래 적용 이력별 절차를 따른다. F05와 F07은 별도로 동작하지만 함께 배포·검증한다. 구 API의 서비스 역할 권한을 끊는 방식은 배포·롤백의 전제가 아니다.

## 배포 전 환경 확인

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 대상 환경이 올바른지 확인.
- 서버 전용 `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`: 새 테이블과 RPC를 사용할 수 있는 자격증명. `NEXT_PUBLIC_` 접두어를 붙이지 않는다. 신규 앱과 CLI는 trim 후 비어 있지 않은 SECRET_KEY를 우선하고, 없으면 SERVICE_ROLE_KEY를 사용한다. **권장 롤백 commit `2260fa1`과 더 오래된 `d02ebca`는 `??` 선택이므로 빈 SECRET_KEY를 fallback하지 않는다.** 앞 키를 사용하지 않는 환경은 빈 변수 대신 그 변수를 제거하고, 값 노출 없이 대상 환경·존재 여부·선택 우선순위를 확인한다.
- `LEMON_SQUEEZY_WEBHOOK_SECRET`, `LEMON_STORE_ID`, `LEMON_API_KEY`: 같은 Live store의 값인지 확인. API key는 주문·라이선스 조회와 기존 환불 비활성화 권한이 필요하다.
- Lemon Squeezy webhook URL과 `order_created`, `order_refunded` 구독, 체크아웃 후 계정 복귀 URL을 대시보드에서 확인. 이 저장소만으로 대시보드 설정은 검증되지 않는다.
- `lib/products/catalog.ts`의 기존 11개 Live variant, checkout URL, 두 번들 구성을 대시보드와 대조한다. 이번 변경은 카탈로그·가격·번들 지급 규칙을 바꾸지 않는다.
- GA4/Ads 설정은 기존 `lib/analytics/config.ts`를 사용한다. 새 MP secret이나 서버 전송기는 추가하지 않았다. 로컬·preview 호스트는 구매 복구 전송을 실행하지 않는다.
- 운영 CLI와 테스트는 Node 24.8.0에서 검증한다. CI도 호환 Node를 지정한다. 자격증명은 승인된 비밀 저장소나 세션 환경으로 주입하고 shell history에 값을 적지 않는다. CLI가 `.env.local`을 자동으로 읽지는 않는다.

### 2026-10-14 배포 준비 당시 확보한 근거

아래 사용자 보고와 에이전트의 저장소·브라우저 확인을 구분한다. Vercel 화면과 feature branch push는 **2026-10-14** 확인했다. 새로운 운영 실행 결과가 생기면 확인 시각·실행자·대상 project/branch와 함께 갱신한다.

| 근거 | 당시 확인 내용 | 해석 |
| --- | --- | --- |
| 사용자 운영 DB 보고 | Supabase `farmverb-store` / `main` Production. 기존 두 테이블의 25개 열이 baseline과 일치하고 제약·index 정상, 신규 객체 이름 충돌 없음. | 현재 `001`→`002`→`003` 최초 적용 경로의 사전 구조 확인. 아직 적용 완료를 뜻하지 않음. |
| 사용자 집계·용도 보고 | purchases 8건 = Test Mode 3건 + 사용자 본인 구매 4건 + NFR 1건. claims 13건, 검사한 이상 수 0, unmapped 문맥 수 1. | 8건 모두 보존한다. 외부 일반 고객 구매 5건으로 해석하지 않으며 NFR과 unmapped 1건의 관계도 추정하지 않는다. 8/13은 보고 당시 기준값이고 정상 증가를 허용한다. 자동 상품 매핑·삭제·owner 변경을 하지 않는다. |
| 사용자 백업 보고 | Physical 백업, 7일 보관. | 사용할 복원 지점·복원 권한·소요 시간은 배포 담당자가 확인. 백업 보유를 복원 연습 완료로 간주하지 않음. |
| 에이전트 Vercel 설정 화면 확인 | Settings → Environments → Production의 Branch Tracking은 `main`. Auto-assign Custom Production Domains는 최초 Enabled였으나 **사용자가 Disabled로 저장했고 에이전트가 reload 후 재확인**했다. Git 연결은 `Hyewonleeeee/FarmVerb`, Deploy Hooks 없음. | Disabled·Save 비활성·수동 promote 필요 안내를 확인했다. 현재 자동 배정은 꺼져 있으며 임의로 다시 켜지 않는다. |
| 에이전트 Domains 화면 확인 | `www.farmverb.com`·`farm-verb.vercel.app`은 Production 연결, `farmverb.com`은 `www.farmverb.com`으로 307 redirect. | 확인한 도메인의 feature branch 연결은 없었다. 향후 push 전에 변경 여부를 확인하며 Production 토글만으로 별도 Preview domain까지 차단된다고 가정하지 않는다. |
| 에이전트 feature branch push·원격 재조회 | 검증된 **`32ae5f8efcdf07dfc2aed77dbd79f6bb14e2531a`만** 안정화 feature branch에 push 완료. `ls-remote`에서 원격 `main`은 `d02ebca7475abda310706eeb64f309eeb2a70917` 그대로임을 확인. | 미커밋 문서·진단 스크립트는 push하지 않았다. 새 Preview Ready와 push 후 Current Production·도메인 유지까지 확인했다. push 시점에는 설정 변경도 없었으며, 이후 Disabled 저장은 아래 실행 기록과 구분한다. `main` merge와 Production 승격은 하지 않았다. |
| 에이전트 로컬 실제 API 실행 | 무료 Supabase CLI + Docker에서 baseline 4/4, `001` 11/11, `002` 11/11, `003` 11/11, 총 **37/37 PASS**. | 실제 Auth/PostgREST의 구 SDK 쿼리 형태·신규 RPC 검증. Next.js route 전체 E2E나 운영 cloud 환경 검증을 뜻하지 않음. [실행 결과](payment-local-supabase-validation.md) 참조. |

Vercel의 Environment Variables 화면에서 `LEMON_API_KEY`, `LEMON_SQUEEZY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`는 각각 **Production and Preview를 함께 대상으로 하는 항목**임을 확인했다. 값은 열지 않았다. Preview가 운영 서비스와 격리됐다고 보장할 수 없어 Preview 구매·계정 API 테스트는 실행하지 않았다. 항목의 존재만으로 실제 키의 유효성이나 store/DB 일치가 검증되지는 않는다.

| 에이전트 배포 준비 화면 확인 | 식별 정보 | 당시 판정 |
| --- | --- | --- |
| [Current Production](https://vercel.com/farmverbs-projects/farm-verb/F2Xpa1TLJwnxXpR9qZyT32CiZmHv) | SHA `d02ebca7475abda310706eeb64f309eeb2a70917`, ID `F2Xpa1TLJwnxXpR9qZyT32CiZmHv`, URL `farm-verb-r34cmbvqh-farmverbs-projects.vercel.app`, Ready. | 현재 운영 배포를 화면으로 확인했다. 원격 main SHA만으로 추정한 결과가 아니다. |
| [Instant Rollback의 Previous 후보](https://vercel.com/farmverbs-projects/farm-verb/ELo1JjGvK3qBVJJfr2UUEGbQ9qsp) | SHA `0a4311930efe34344e2c0f928b08986673fc315f`, ID `ELo1JjGvK3qBVJJfr2UUEGbQ9qsp`, URL `farm-verb-mh34blobg-farmverbs-projects.vercel.app`, Production·Oct 3 promoted 표시. | 선택창만 확인하고 Continue 없이 Cancel했다. 플랫폼 후보임을 확인한 것이며 새 DB와의 앱 호환성은 검증하지 않았다. |
| [기존 `2260fa1` 배포](https://vercel.com/farmverbs-projects/farm-verb/D2LLX77jHV6qSR6rmtAWispe6qrQ) | ID `D2LLX77jHV6qSR6rmtAWispe6qrQ`, URL `farm-verb-iafv06yc9-farmverbs-projects.vercel.app`, Ready·Preview·Assigning Custom Domains Skipped. | 권장 **Production fallback artifact는 아직 확보하지 못했다.** Preview Ready를 Production 환경의 복귀 준비 완료로 보지 않는다. |
| [새 `32ae5f8` Preview](https://vercel.com/farmverbs-projects/farm-verb/G8fj3Lz38jskcAV4kNqpcjbxdQr1) | SHA `32ae5f8efcdf07dfc2aed77dbd79f6bb14e2531a`, ID `G8fj3Lz38jskcAV4kNqpcjbxdQr1`, URL `farm-verb-omgaatve9-farmverbs-projects.vercel.app`, Ready(31초)·Preview·Assigning Custom Domains Skipped. | push 후 Overview에서도 Current Production은 `d02ebca`/`F2Xpa1TLJwnxXpR9qZyT32CiZmHv`이고 도메인 연결은 동일했다. Preview 구매·계정 API는 호출하지 않았다. |

처음에는 staging 환경이 없었으나 무료 로컬 Supabase CLI + Docker를 준비해 위 검증을 완료했다. 유료 cloud staging은 사용하지 않았다. 당시 미확인이었던 Production 복귀 배포물·운영 DB 적용·앱 전환은 아래 재개 및 최종 기록에서 확인했다. 운영 환경변수의 실제 조합·cloud 설정 차이·Lemon 구독·GA4/Ads 수신은 그 결과와 구분한다. 아래 명령은 절차 예시이며 실제 실행 범위는 실행 확인서를 따른다.

### 2026-10-14 배포 실행 중단 기록

사용자가 자동 domain 배정을 Disabled로 저장한 뒤 에이전트가 재확인했다. 이후 Create Deployment에서 정확한 `2260fa14c6b315a78cfbb3b0868cea3e1ba651c6`와 `main` branch configuration·Production 환경을 선택해 제출했으나, Vercel이 해당 commit과 branch 조합을 거부했다: `The provided GitHub repository reportedly has the commit reference but not for given branch name...`. `2260fa1`은 현재 `main`에 포함되지 않아 이 경로의 **fallback 생성은 실패**했다. UI의 Production 선택만으로 생성 가능성이 확인된 것은 아니었다.

사용자가 정한 오류 발생 시 중단 조건에 따라 Cancel 후 추가 실행을 중단했다. 오류 후 Overview 읽기 전용 재조회에서 Current Production은 `d02ebca7475abda310706eeb64f309eeb2a70917` / `F2Xpa1TLJwnxXpR9qZyT32CiZmHv` Ready이며 `www.farmverb.com`·`farm-verb.vercel.app` 연결도 그대로였다. 이 배포 시도의 **백업 확인·직전 snapshot·001/002/003·main merge·promote는 모두 미실행**이다. 이전 사용자 백업 보고와 혼동하지 않는다. 다음 후보 경로는 정확한 `2260fa1` checkout의 CLI `vercel deploy --prod --skip-domain`이지만, Vercel CLI 연결이 준비되지 않았으며 이번 중단 후 실행하지 않았다. 오류 우회를 위한 `main` 조기 merge나 Production Branch 변경은 하지 않는다.

### 2026-10-14 재개 기록: Production fallback 생성 성공

앞선 UI 실패 이후 사용자의 CLI 로그인 완료로 배포를 재개했다. 정확한 `2260fa14c6b315a78cfbb3b0868cea3e1ba651c6`를 CLI `--prod --skip-domain`으로 배포해 **Production / Staged / Ready** fallback을 확보했다. deployment ID는 `dpl_DBnE2HYKqtPqnA1rPQoxKNKJcWCS`, URL은 [farm-verb-nji7fjh3h-farmverbs-projects.vercel.app](https://farm-verb-nji7fjh3h-farmverbs-projects.vercel.app)이다. Dashboard에서도 custom domains skipped를 확인했다. 앞선 “fallback 미확보·CLI 미연결”은 중단 당시의 기록이며 이 재개 결과가 최신 상태다.

생성 후 `www.farmverb.com`·`farm-verb.vercel.app`의 Current Production은 기존 `d02ebca7475abda310706eeb64f309eeb2a70917` / `F2Xpa1TLJwnxXpR9qZyT32CiZmHv` 그대로임을 확인했다. fallback 생성 성공을 운영 domain 전환이나 새 DB에서의 runtime 검증 완료로 보지 않는다.

### 2026-10-14 재개 기록: 운영 DB 적용·기존 데이터 보존 확인

Supabase Production에서 최신 Physical 백업 **2026-10-13 20:05:33 UTC(10월 14일 05:05:33 KST)**, Restore 활성화, project Healthy를 확인했다. 복원 실행은 하지 않았다. 이후 `32ae5f8efcdf07dfc2aed77dbd79f6bb14e2531a`의 migration **001 → 002 → 003**을 SQL Editor에서 각 파일 전체로 순서대로 실행했다. 매번 실행 전 편집기 내용과 대상 파일의 SHA-256 일치를 확인했고, 세 실행 모두 `Success. No rows returned`를 확인했다. 동일한 파일임을 확인한 읽기 전용 `scripts/payment-schema-check.sql`도 통과했다. SQL Editor 실행 성공이 Supabase의 migration history에 자동 등록되었다는 뜻은 아니므로 적용 증거와 이력을 구분한다.

전후 snapshot 시각은 **03:16:13.691264 UTC → 03:26:10.154314 UTC**다. 비교 결과 **기존 21행(purchases 8·claims 13) 모두 동일**, 추가·삭제·행 hash 변경 없음, baseline column fingerprint 동일, 미매핑 1행 보존으로 PASS했다. NFR과 미매핑 행의 관계는 여전히 추정하지 않는다. 원본은 `/Users/hyewon/FarmVerb-deployment-records/2026-10-14/payment-data-before.csv`와 `payment-data-after.csv`에 권한 `0600`으로 비공개 보관한다. 이 기록은 운영 DB 적용·보존 확인이며 앱 승격이나 실제 결제·다운로드·라이선스 E2E 완료를 뜻하지 않는다.

### 2026-10-14 최종 실행 기록: Production 전환 완료

`main`을 **`32ae5f8efcdf07dfc2aed77dbd79f6bb14e2531a`로 fast-forward push**했고 Git 연동 Production build가 36초 만에 Ready가 되었다. **약 12:29 KST**에 Vercel UI에서 수동 Promote한 뒤 Overview에서 `www.farmverb.com`·`farm-verb.vercel.app`이 모두 새 배포를 가리키는 것을 확인했다. 당시 deployment ID는 **`dpl_3F1ZW6hUFVHKL4ytwaMXzmm9aai5`**, URL은 [farm-verb-p8xv9piwt-farmverbs-projects.vercel.app](https://farm-verb-p8xv9piwt-farmverbs-projects.vercel.app)이다. **당시 Auto-assign Custom Production Domains는 Disabled를 유지했다.** 앞선 중단·미실행·기존 Current 표시는 각 시점의 이력이며 이 기록은 2026-10-14 배포의 최종 결과다.

### 2026-10-14 배포 실행 확인서

| 항목 | 실제 확인 결과 |
| --- | --- |
| 운영 DB | exact `32ae5f8`의 001 → 002 → 003 전체 파일 적용 성공, 실행 전 SHA-256 일치 확인, 읽기 전용 schema gate PASS. Supabase migration history 등록 작업은 하지 않았음. |
| 기존 데이터 | 전후 기존 21행(purchases 8·claims 13) 동일, 추가·삭제·hash 변경 없음, baseline fingerprint 동일, 미매핑 1행 보존. NFR/미매핑 재처리 없음. |
| Runtime·요청 로그 | 새 배포의 CLI 조회에서 **runtime error 0·HTTP 5xx 0**. 조회 구간 `2026-10-14T03:25:57Z` → `03:35:57Z`, 제외 구간 없음. 이 시간 범위 밖이나 실제 결제 성공을 증명하지는 않음. |
| 공개 페이지 | 읽기 전용 HTTP 확인: `/`, `/cart`, `/login` 모두 200. |
| 인증 경계·웹훅 method | 비로그인 `/api/account/purchases` 및 합성 null UUID의 licenses/downloads 요청은 401. 웹훅 GET은 405. 실제 결제·환불 POST는 보내지 않음. |
| 전환 후 읽기 전용 SQL 집계 | events 총 0, 실패·대기·격리 모두 0. purchases 8(test 3, linked 8, unmapped 1, claim_review 0). claims 13(analytics enabled 0, lease 0). 빈 수신함을 결제 전달 검증으로 해석하지 않음. |
| 운영 CLI 범위 | 로컬 서버 키가 없어 `status --check`는 실행하지 않음. 대신 승인된 읽기 전용 SQL로 수신함 상태 집계를 확인함. CLI 실행 성공으로 표기하지 않음. |

복귀용 `2260fa14c6b315a78cfbb3b0868cea3e1ba651c6`의 Production Staged artifact **`dpl_DBnE2HYKqtPqnA1rPQoxKNKJcWCS`**는 유지한다. 실제 Live checkout, 서명된 webhook 전달, 로그인 상태의 라이선스·다운로드, GA4 실제 수신은 **미검증**이며 이번 배포 완료와 구분한다. NFR과 미매핑 1행의 관계는 여전히 확인되지 않았다.

### 당시 배포 절차 참고: 자동 domain 배정 중지 → DB → main build → 수동 전환

아래는 2026-10-14에 사용한 절차다. 운영 001/002/003은 이미 적용됐으므로 Windows 인계나 빈 migration history 화면을 이유로 재실행하지 않는다.

1. 완료된 [무료 로컬 실제 API 검증 결과](payment-local-supabase-validation.md)와 남은 운영 환경 차이를 확인한다. 유료 cloud staging은 이 경로의 필수 조건이 아니다. 추가 cloud 검증이 필요한 경우에만 [별도 staging 절차](payment-staging-validation.md)를 사용하며, 운영 데이터 복제나 Dashboard branch의 Pull·자동 migration 동기화는 사용하지 않는다.
2. 배포 대상 SHA, 현재 Current deployment ID/URL, 대상 production domain 목록, 복귀할 `2260fa1` deployment와 환경변수 조합을 기록한다. `32ae5f8`의 검증된 코드와 승인된 배포 checkout이 일치해야 한다. 사용자 파일이 섞인 현재 작업 폴더를 자동 업로드하거나 `git clean`으로 정리하지 않는다.
3. 전체 운영 실행 계획에 대한 명시적 배포 승인과 **Auto-assign Custom Production Domains Disabled 저장 확인**이 필요하다. 2026-10-14 두 조건을 충족했고 UI 오류 후 CLI로 재개했다. 이후 배포에서는 설정과 접근 준비를 새로 확인한다. [Vercel staged production 절차](https://vercel.com/docs/deployments/promoting-a-deployment#staging-and-promoting-a-production-deployment)
4. 승인된 범위에서 정확한 `2260fa1` checkout을 **Production 환경의 fallback artifact**로 준비한다. `vercel deploy --prod --skip-domain` 또는 동등한 방법으로 domain을 연결하지 않고 배포물 ID·SHA·환경변수 조합을 확인한다. Preview Ready만으로 이 단계는 충족되지 않는다. 새 DB가 필요한 runtime 확인은 다음 단계의 DB 적용·사후 검사 뒤 별도로 수행한다.
5. 사용할 복원 백업과 적용 직전 snapshot을 확인한 뒤 아래 운영 `001`→`002`→`003` 절차 및 사후 schema·snapshot 비교를 완료한다. 새 DB에서 fallback runtime을 확인하고 로컬 결과와 운영 결과를 다른 근거로 보관한다. 검증 실패 시 다음 main merge/promotion 단계로 넘어가지 않는다.
6. 검토한 `32ae5f8`의 코드 변경을 포함하는 정확한 revision을 `main`에 merge하여 **Production 환경의 staged build**를 생성한다. merge SHA가 달라지면 원본과 변경 내용을 대조해 기록한다. Ready 상태·Production 환경·SHA·domain 미전환을 확인하고 아래 읽기 전용 관찰을 수행한다. Preview 승격은 Production 환경으로 새 배포가 생길 수 있으므로 Preview 성공으로 대체하지 않는다. [Vercel promote 공식 문서](https://vercel.com/docs/cli/promote)
7. 운영 DB 사후 결과, staged build와 준비된 fallback artifact가 모두 확인되면 승인된 계획에 따라 **그 정확한 deployment URL/ID**를 수동 promote한다. 이후에도 자동 배정 설정 상태를 기록하며 별도 계획 없이 다시 Enabled로 바꾸지 않는다. 2026-10-14의 실제 전환 결과는 위 최종 실행 기록을 따른다.

아래는 main build 이후 사용하는 예시다. `farmverb_release_url`에는 확인한 deployment URL/ID만 넣고 자격증명을 넣지 않는다. **promote는 실제 production domain을 변경**하므로 승인된 계획의 마지막 검증을 통과했을 때만 실행한다.

```sh
# 조회: main build의 정확한 URL/ID로 SHA·환경·상태를 확인한다.
vercel inspect "$farmverb_release_url"

# 변경: 승인된 계획에 따라 검증한 deployment로 domain을 전환한다.
vercel promote "$farmverb_release_url"
vercel promote status
```

아직 production domain에 연결된 적 없는 `2260fa1` fallback을 준비해야 한다면, 중단 이후 재개가 정해지고 CLI 연결이 준비된 단계에서 정확한 checkout과 Production 환경변수로 `vercel deploy --prod --skip-domain`을 사용할 수 있다. 이 옵션은 해당 배포의 자동 domain 할당을 미룰 뿐 다른 `main` build를 차단하지 않는다. 생성만으로 Instant Rollback 대상이 되는 것도 아니므로 아래 수동 fallback 절차를 따른다. 운영 DB가 준비되기 전에 domain을 연결하지 않는다. [Vercel deploy 공식 문서](https://vercel.com/docs/cli/deploy#skip-domain)

## migration 및 배포 순서

1. 운영 적용은 별도 승인 후 진행한다. 사용자 보고로 확인한 baseline 구조와 집계 결과, 완료된 로컬 실제 API 검증을 기준으로 삼고, 남은 운영 환경 차이·백업/복원 수단·롤백 배포물 준비를 확인한다. 전체 감사를 반복하는 대신 적용 직전의 대상 DB와 snapshot을 기록한다.
2. 기존 migration 세 개와 `001`/`002`의 적용 이력을 확인한다. 아직 새 SQL을 적용하지 않은 환경은 아래 순서대로 각 한 번 적용한다. 이미 적용한 환경은 아래 표에 따라 미적용 파일만 적용한다.
   - `supabase/migrations/202610130001_payment_event_recovery.sql`
   - `supabase/migrations/202610130002_analytics_checkout_recovery.sql`
   - `supabase/migrations/202610130003_purchase_write_guards.sql`
3. 각 파일의 `BEGIN`/`COMMIT` 전체를 실행하고 runner는 오류 발생 시 중단해야 한다. 현재 `001`은 guard/grant/policy를 같은 transaction의 COMMIT 전에 설치해, 새 분류만 공개되고 구 API 보호는 아직 없는 중간 상태를 만들지 않는다. `002`도 명시적 transaction 안에서 함수 생성과 `REVOKE`를 함께 commit한다. SQL 편집기에서 일부 문장만 골라 실행한 결과를 완료로 간주하지 않는다.
4. 새 컬럼·테이블·RPC·`003` trigger/policy 및 PostgREST schema reload를 확인한다. 브라우저 anon/authenticated 역할이 수신함과 변경 RPC, 구매·claim 테이블의 직접 읽기/쓰기에 접근할 수 없어야 한다. `003`의 restrictive RLS policy가 기존 permissive policy와 함께 동작하는지 확인한다. 서비스 역할의 SELECT/INSERT/UPDATE는 유지하며 구 API와 신규 RPC의 정상 주문 처리를 모두 검증한다.
5. 첫 migration은 기존 `user_id`가 있는 행의 **연결 분류만** `linked`로 표시한다. 주문 소유자·권한·금액을 재배정하지 않는다. 기존 미연결 주문은 기존 이메일 연결 방식이 유지된다. 이전 결함으로 생긴 잘못된 연결/누락은 자동 추정·일괄 수정하지 않는다.
6. 신규 적용 환경은 **현재 `001` commit 직후** 구 직접 쓰기 보호가 활성화되어 `002`/`003` 사이에도 유지된다. 이전 `2260fa1`판 `001`을 적용한 환경은 `003`으로 이 보호를 추가한다. 미적용 migration의 commit과 아래 호환성 검증 완료 후 앱을 배포한다. schema 없이 새 앱을 먼저 배포하면 체크아웃 생성·웹훅 저장·계정 조회가 실패할 수 있다. 이후 배포 시 Auto-assign 상태를 다시 확인하고, 정해진 순서에 따라 schema 완료 전에 `main` merge/push 또는 promotion을 하지 않는다.
7. 로컬 실제 API 37개는 SDK 쿼리/RPC 범위다. 체크아웃→웹훅→계정→다운로드/라이선스→분석 callback의 전체 E2E와 외부 수신은 별도 미검증으로 남긴다. Live allowlist 때문에 운영 webhook은 Test Mode 이벤트를 계속 무시한다. 테스트를 위해 운영 store/variant 검사를 해제하지 않는다. 로컬·staging 호스트에서는 구매 분석 복구가 실행되지 않으므로, 네트워크가 차단된 production-host mock의 callback 결과와 실제 Google 수신 검증을 구분한다.
8. 승인된 실제 결제 검증은 별도 일정으로 수행한다. 배포 직후 웹훅 오류·격리 이벤트·주문 대조 결과를 관찰한다.

| 확인된 DB 적용 이력 | 적용 절차 |
| --- | --- |
| 기존 migration 세 개만 적용, `001`/`002` 미적용 | 현재 `001` 전체를 한 번 적용하고 guard 활성화를 확인한 뒤 `002`→`003` 적용. |
| 이전 `2260fa1`판 `001`만 적용 | `001` 재실행 없이 현재 `002`와 `003` 적용. 구 직접 쓰기 보호는 `003` commit 후 확인. |
| 이전 `2260fa1`판 `001`/`002` 적용 | 기존 이력을 유지하고 `003` 추가 적용. `001`/`002`를 새 내용으로 재실행하지 않음. |
| 현재 `001` 또는 `003`까지 적용하다 중단 | 적용 이력·commit 여부·guard 존재를 확인한 뒤 미완료 단계부터 판단. `003`의 재적용 가능성을 `001` 전체 재실행 허용으로 해석하지 않음. |

현재 `001` 파일은 최초 배포의 transaction 공백을 막기 위해 guard/grant/policy를 포함하도록 보강했다. **이미 실행한 이전 `001`의 이력은 수정·삭제하지 않는다.** 적용된 버전의 기록을 보존하고 추가 migration `003`으로 보강한다. `003`은 현재 `001`과 동일한 guard를 재확인하며 함수·trigger·policy 교체를 재적용할 수 있지만, 운영 실행 전에는 적용 이력과 실패 지점을 확인한다.

psql로 적용한다면 각 파일의 명시적 transaction을 그대로 실행하고 `ON_ERROR_STOP`으로 오류 시 중단한다. 승인된 대상 DB의 libpq 연결 환경을 비밀 관리 수단으로 먼저 지정하고 대상 DB 식별을 확인한다. URL·비밀번호를 명령줄 인자나 문서에 적지 않는다. 아래 순서는 **운영 DB 적용 승인을 받은 후** 한 단계씩 실행한다. 각 migration은 **DB를 변경한다.** 실패하면 다음 명령으로 넘어가지 않고 transaction 결과를 확인한다. 이 문서를 작성하면서 실행하지 않았고, 이미 적용한 migration을 반복하는 용도로 사용하지 않는다. `001`/`003`에는 lock 5초·statement 60초 제한이 있으나 `002`에는 없으므로, 적용 세션에도 같은 timeout을 설정한다. CLI에서는 `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=60s'`를 해당 psql 프로세스에 지정할 수 있다.

```sh
# 조회: 적용 직전 baseline을 보존한다. 저장 결과는 승인된 운영 기록에서 관리한다.
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-schema-preflight.sql
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-data-preflight.sql
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-data-snapshot.sql

# 변경: 최초 적용 경로. 앞 파일의 COMMIT 확인 후 다음 파일을 실행한다.
psql -X --set=ON_ERROR_STOP=1 --file=supabase/migrations/202610130001_payment_event_recovery.sql
psql -X --set=ON_ERROR_STOP=1 --file=supabase/migrations/202610130002_analytics_checkout_recovery.sql
psql -X --set=ON_ERROR_STOP=1 --file=supabase/migrations/202610130003_purchase_write_guards.sql

# 조회: 새 schema 요구 조건과 기존 데이터 보존 여부를 확인한다.
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-schema-check.sql
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-schema-preflight.sql
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-data-preflight.sql
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-data-snapshot.sql
```

사후 inventory의 열 수는 기존 두 테이블 32개와 inbox 16개, 총 48개가 기준이다. 개수만으로 통과시키지 않고 타입·기본값·권한·guard를 함께 확인한다. `*_before_action=STOP_*`은 사전 이름 충돌 판정이므로 적용 후 정상 생성된 객체와 구분한다. **`payment-data-snapshot.sql`은 전후 fingerprint 비교용이며 데이터를 복원할 수 있는 백업이 아니다.** 사용자 보고의 Physical 백업과 구분한다. snapshot 전후 8/13을 고정 기대값으로 사용하지 않는다. 변경되지 않아야 하는 기존 행과 새로 발생한 정상 주문·claim을 구분하고, 예상하지 않은 감소·소유자/금액/상태 변경은 전환을 중단하고 확인한다. transaction 안의 조회 snapshot과 서로 다른 실행 시점의 비교는 동일하지 않다.

파일 적용 기록만으로 검증을 끝내지 않는다. 같은 DB에서 `lease_purchase_analytics(uuid,uuid,uuid)`의 anon/authenticated 실행 권한이 false, service_role 실행 권한이 true인지 조회한다. 로컬 서비스 자격증명의 실제 PostgREST 호출은 합성 claim으로 통과했지만 운영 키·환경 검증을 대신하지 않는다. transaction 적용이나 권한 검증에 실패하면 신규 앱 promotion을 진행하지 않는다. 실패한 단계·commit 여부를 먼저 확인하고 이미 commit된 파일 전체를 무조건 재실행하지 않는다.

`003` 적용 후 승인된 DB 세션에서 아래 **읽기 전용 schema 검사**를 실행한다. 동일한 libpq 연결 환경을 사용하고 자격증명을 출력하지 않는다. 테이블·RLS·RPC·trigger·grant의 존재와 요구 조건을 assert하는 검사이며, 합성 주문 동작·동시성·실제 서비스 키의 PostgREST 호출을 대신하지 않는다. 이 문서의 명령 예시는 운영에서 실행했다는 증거가 아니다.

```sh
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-schema-check.sql
```

## 구 API 호환성 검증과 앱 롤백

2026-10-14에 정한 롤백 기준은 **앱 `2260fa1` + 보강된 DB 유지**다. 처음 확인한 `D2LLX77jHV6qSR6rmtAWispe6qrQ`는 Preview였으나, 이후 Production Staged fallback `dpl_DBnE2HYKqtPqnA1rPQoxKNKJcWCS`를 확보했다. 신규 수신함·claim 검증·분석 복구 API를 유지하는 기준이지만, 현재 복구에 사용하려면 배포물 존재·환경변수·이후 변경과의 호환성을 다시 확인한다. 당시 화면의 이전 Production 후보 `0a43119`를 앱 호환성 검증 없이 대체 fallback으로 사용하지 않는다.

더 오래된 **`d02ebca`는 구 API가 계속 실행되는 경우와 최악의 롤백에 대비한 DB 호환성 테스트 대상이며 권장 운영 롤백이 아니다.** DB guard가 구 API 요청까지 처리하므로 구 서비스 키의 권한 회수나 구 API 차단을 정상 운영의 전제로 두지 않는다. 아래 중 구 SDK 쿼리 형태·신규 RPC의 완료 범위는 [로컬 실제 API 결과](payment-local-supabase-validation.md)를 따른다. 앱 전체와 실제 Vercel rollback artifact 검증은 남아 있으며 로컬 통과를 운영 검증 완료로 표기하지 않는다.

1. 기존 schema와 구 앱에서 정상 구매·계정 조회의 기준 결과를 기록한다. 합성 계정 A/B, 공식 variant와 정상·환불 주문을 준비한다. 실제 고객 주문을 fixture로 변경하지 않는다.
2. 구 앱을 유지한 상태로 현재 `001`을 적용한 **직후**부터 `email_allowed`/`claim_review` 주문, 소비된 claim, 수신함 증거 fixture로 보호를 확인한다. `002` 후와 `003` 후에도 같은 검증을 반복해 migration 사이 공백을 확인한다. 실제 `d02ebca`의 `upsert`와 이메일 연결 `UPDATE` 형태를 서비스 역할로 실행하고 아래 표의 **DB 재조회 결과**를 확인한다. status 200이나 SQL 영향 행 수만으로 성공 처리하지 않는다.
3. 신규 앱에서 같은 시나리오와 정상 RPC 경로를 확인한다. 신규 claim, 중복·지연 웹훅, 계정 구매 조회·라이선스 조회, 새/구 JS 혼재의 결과를 기록한다.
4. DB를 그대로 둔 채 staging 앱만 권장 기준 `2260fa1`로 되돌려 정상 신규 claim→수신함→구매 조회 및 분석 API가 유지되는지 확인한다. 빈 SECRET_KEY가 없는 rollback 환경도 확인한다. 별도의 최악 상황 테스트에서만 `d02ebca` direct-write 표를 재검증한다. 기존 열린 브라우저 탭이 다른 버전 JS를 유지할 수 있다는 전제도 포함한다.

| 합성 시나리오 | commit 후 확인할 결과 |
| --- | --- |
| A 소유 주문을 구 upsert/UPDATE가 B 또는 null로 변경 | 기존 A 유지. 유효한 신규 claim이 있어도 이미 있는 owner를 바꾸지 않음. 충돌 쓰기의 HTTP 500을 필수 결과로 기대하지 않음. |
| 미연결 `claim_review` 주문에 구 이메일 연결 UPDATE | 임의 이메일 fallback으로 지급되지 않음. 해당 주문 ID·사용자·variant가 모두 맞는 소비된 claim 증거로 연결할 때만 허용. |
| DB 수신함에 claim 존재/reconciliation 증거 또는 소비된 claim이 있는 주문 | 구 writer도 증거를 무시한 이메일 연결을 하지 못함. 증거가 없는 다른 계정에 연결되지 않는지 확인. |
| 부분 환불 뒤 구 `paid`, 전체 환불 뒤 구 `paid`/부분 환불 재수신 | 각각 `partial_refund`/`refunded` 유지. 새 RPC에서도 동일하며, 완전 환불 후 계정 다운로드 권한이 되살아나지 않는지 확인. |
| `fraudulent` 뒤 구 `paid`, `paid` 뒤 `pending`/`failed` | 기존 상태를 유지하고 회귀한 snapshot의 금액·통화 등으로 덮어쓰지 않음. |
| 동일 행의 id/order ID/variant/Live mode 또는 기존 non-null product slug 변경 | SQLSTATE `22023`으로 거부. owner/refund 필드 보존과 달리 identity 충돌은 오류이므로 정상 재전송처럼 처리하지 말고 원인을 확인. |
| 정상 신규 claim 주문 및 기존 no-claim `email_allowed` 주문 | 구·신 API의 정상 생성/조회가 계속 가능하고 허용된 계정 연결이 동작. DB 보호가 모든 주문 지급을 막는 회귀가 없어야 함. |
| 합성 owner 계정 삭제의 FK `SET NULL` | auth 사용자 삭제에 따른 null만 허용하고 주문을 `claim_review`로 남김. 다른 이메일 계정이 가져가지 못함. |
| anon/authenticated 직접 테이블 요청과 신규/구 서버 요청 | 브라우저 직접 접근은 차단, 서비스 역할의 정상 쓰기는 허용. 신규 RPC lease/저장도 정상 동작. |

운영 롤백이 필요하면 검증한 `2260fa1`의 deployment ID/commit, 전환 시각, 적용된 migration/trigger와 서비스 키 환경을 기록하고 **앱 라우팅만** 되돌린다. `001`/`002`/`003`, 수신함, 연결 분류, 분석 ACK를 유지한다. trigger 비활성화·RLS 제거·데이터 삭제 down migration을 롤백 절차에 포함하지 않는다. 롤백 후 정상 계정 조회와 알려진 주문 ID의 `reconcile` 결과를 대조한다. 복구 CLI는 검토된 신규 코드의 도구를 사용하되 조회부터 시작한다.

| 실패 시점 | 중단·복구 절차 |
| --- | --- |
| migration 실패/접속 끊김 | 다음 파일과 앱 전환을 중단한다. 오류가 난 transaction은 rollback 여부를 확인하고, 연결 끊김은 COMMIT 결과 불명일 수 있으므로 실제 객체를 조회한다. 이미 commit한 001을 재실행하지 않는다. |
| DB 적용 완료, 앱 build 실패 | 현재 앱의 domain을 유지한다. 새 DB guard는 유지하고 build 원인을 해결한다. DB를 이전 snapshot으로 덮어쓰지 않는다. |
| promote 실패 | Current deployment와 실제 domain을 다시 조회해 전환 여부를 확정한다. 실패 응답만 보고 이전 앱이 계속 서비스된다고 가정하지 않는다. |
| 전환 후 구매·계정 장애 | 검증된 `2260fa1` fallback으로 앱만 전환하고, 경계 시각의 provider 주문을 읽기 전용 대조한다. DB 보호·기존 행은 유지한다. |
| 실제 DB 손상 | 자동 down migration 대신 담당자와 백업 복구 범위·이후 발생 주문의 재대조를 결정한다. 7일 백업의 존재만으로 최신 주문까지 복원된다고 판단하지 않는다. |

과거 production domain을 받은 적 있고 계정 요금제/권한상 복귀 가능한 배포물은 `vercel rollback "$farmverb_fallback_url"` 대상이 될 수 있다. 한 번도 production에 연결되지 않은 staged `2260fa1`은 Instant Rollback 대상으로 가정하지 않고 `vercel promote "$farmverb_fallback_url"`로 전환한다. 둘 다 실제 domain 변경이며 승인된 복구 계획 안에서만 실행한다. 정확한 fallback URL/ID, SHA, Production 환경변수를 전환 전에 확인한다. rollback은 환경변수를 다시 빌드하지 않으므로 최신 대시보드 값과 기존 배포물의 값을 구분한다. **Instant Rollback은 자동 domain 배정을 끄지만, rolled-back 상태에서 Undo Rollback 또는 promote로 복귀하면 다시 켜질 수 있으므로** rollback/재승격 후 설정을 다시 확인한다. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback), [rollback CLI](https://vercel.com/docs/cli/rollback)

DB guard는 `d02ebca`의 모든 결함을 해결하지 않는다. 수신함·소비 기록 등 **해당 주문과 연결된 DB 증거가 없는** invalid/expired claim의 존재는 DB guard가 알 수 없다. `d02ebca` webhook이 이를 버리고 새 no-claim 주문처럼 저장하면 안전한 이메일 주문과 완전히 구별할 수 없어 이전 이메일 fallback 위험이 남는다. `d02ebca`의 30분 claim 유효기간·수신 시각 기준 판정, 미등록 variant 격리 부족, 라이선스 부가 조회/장바구니 저장소 오류 처리도 DB만으로 고쳐지지 않는다. **권장 롤백 `2260fa1`은 수신함과 claim 검증을 유지하므로 이 구 webhook 결함을 다시 도입하지 않는다.**

`d02ebca` webhook이 처리한 주문은 새 수신함에 없을 수 있으므로 `status --check` 종료 코드 0만으로 누락이 없다고 판단하지 않는다. 해당 구 버전이 실행된 기간이 있다면 결제 대시보드의 주문 ID를 지정해 대조하고 필요한 웹훅 재전송/복구는 원인과 증거를 확인한 뒤 수행한다. 분석 복구·구 JS callback의 한계는 아래 GA4 절차를 따른다.

## 주문 확인과 복구

아래 예시 ID는 실제 값으로 바꾸되, **기본 조회부터** 시작한다. 이번 작업에서는 아래 운영 명령을 실제 자격증명으로 실행하지 않았다.

```sh
# 최근 미처리/실패/격리 이벤트 최대 100건. 고객 이메일·claim·키는 출력하지 않는다.
npm run payments:recovery -- status

# 조회만 수행하는 모니터링용 검사. 미처리 상태가 있으면 종료 코드 2, 실행 오류는 1.
npm run payments:recovery -- status --check

# 특정 주문의 이벤트 상태
npm run payments:recovery -- status --order-id 123456

# Lemon API와 저장된 구매 상태를 읽어 대조한다. 변경하지 않는다.
npm run payments:recovery -- reconcile --order-id 123456

# 특정 저장 이벤트의 재처리 대상 확인. 변경하지 않는다.
npm run payments:recovery -- replay --event-id 00000000-0000-4000-8000-000000000001

# 아래부터 실제 쓰기. 담당자가 사유·대상·증거를 확인한 경우에만 사용한다.
npm run payments:recovery -- replay --event-id 00000000-0000-4000-8000-000000000001 --apply
npm run payments:recovery -- reconcile --order-id 123456 --apply
```

| 상태/사유 | 의미와 대응 |
| --- | --- |
| `processed` | 해당 이벤트 처리 완료. `replay --apply`도 `duplicate: true`로 반환하며 다시 저장·지급하지 않는다. 결제 자체와 계정 지급 성공을 동일시하지 말고 아래 사후 대조를 수행한다. |
| `pending`, `failed` | 서버/DB/API 오류를 해결한 뒤 같은 event ID를 replay한다. 이미 저장된 주문이나 소비된 같은-order claim은 중복 처리된다. |
| `processing` | 처리 중. 2분 lease가 지난 뒤에도 남으면 작업 중단 가능성을 확인하고 replay한다. 활성 worker의 lease는 빼앗지 않는다. |
| `busy` | CLI 처리 시 lease를 얻지 못한 결과. 새 작업이 실행되었다는 뜻이 아니다. `status --order-id`로 현재 이벤트 상태를 읽고 활성 작업 종료 또는 lease 만료 후 판단한다. |
| `unmapped_variant` | Live 대시보드에서 상품을 확인하고 명시적 카탈로그 매핑 변경을 검토한다. 매핑 후 해당 이벤트 replay. |
| `claim_expired`, `claim_invalid`, `claim_reused`, `claim_variant_mismatch` | 원래 계정 연결 증거를 확인한다. 이메일만으로 다른 계정에 지급하지 않는다. 만료된 실제 주문의 소유권 재지정은 별도 지원 검토가 필요하며 CLI는 임의 사용자 지정 기능을 제공하지 않는다. |
| `reconciliation_owner_review`, `ownership_conflict`, `account_review_required` | 주문 존재는 확인해도 계정 귀속을 자동 결정하지 못한 상태. 기존 owner를 보존하고 담당자가 근거를 검토한다. |

`reconcile --apply`는 merchant API에서 읽은 실제 주문을 저장 이벤트 처리기에 넘긴다. 수신함에 원래 claim 증거가 있으면 재사용한다. 원래 웹훅이 전혀 도착하지 않았고 owner 증거도 없으면 자동 이메일 연결을 하지 않는다. 미등록 상품도 검토 상태로 남는다.

**종료 코드 0은 복구 성공 판정이 아니다.** `replay`/`reconcile --apply`는 `quarantined`, `busy`, `duplicate: true`여도 명령 실행 자체가 정상 종료되면 0을 반환한다. JSON의 `state`, `reason`, `duplicate`를 함께 확인한다. 코드 1은 인자·자격증명·DB·provider 등 실행 오류이고, 코드 2는 `status --check`가 읽은 최대 100건 중 `processed`가 아닌 이벤트가 있다는 뜻이다. 일반 `status`에는 같은 상태가 있어도 0일 수 있다.

`reconcile --apply`가 출력하는 `purchasePresent`, `purchaseStatus`, `accountLinked`, `eventCount`는 **적용 전 조회 결과**다. 아래 순서로 사후 상태를 다시 읽는다.

1. 먼저 `replay` 또는 `reconcile`을 `--apply` 없이 실행해 대상과 사유를 확인한다. 이 dry-run은 저장 이벤트/주문 조회이며, 성공할 쓰기 결과나 소유권 해결을 미리 보장하지 않는다.
2. 필요한 쓰기를 실행한 뒤 반환된 event ID와 `state`/`reason`/`duplicate`를 기록한다. 고객 이메일·claim·키는 기록하지 않는다.
3. `status --order-id 123456`과 `reconcile --order-id 123456`을 **다시** 실행해 이벤트 상태와 provider/purchase 상태, 계정 연결 여부를 확인한다. 실제 계정·파일·라이선스 사용 가능 여부는 승인된 대상 계정에서 별도로 확인한다.
4. `processed` 이벤트 재실행은 no-op이다. 최신 provider 상태로 별도 대조가 필요하면 `reconcile`의 dry-run부터 시작한다. 동일 provider snapshot의 reconciliation도 이미 `processed`이면 중복으로 끝날 수 있다. CLI는 이벤트 상태 강제 초기화·임의 계정 재배정 기능을 제공하지 않으므로, 계속 불일치하면 근거를 보존하고 원인별 지원 검토로 넘긴다.

환불 이벤트 replay/reconcile의 `--apply`는 기존 검증 절차에 따라 **완전 환불 주문의 라이선스를 비활성화할 수 있다.** 현재 provider 주문·store·mode·환불 상태를 다시 확인한 뒤만 실행한다. 부분 환불은 기존 권한을 유지한다. 키별 처리 중 실패하면 같은 이벤트를 재실행하며 이미 비활성화된 키는 성공으로 취급한다.

`status`는 Supabase 서버 자격증명만 필요하며 Lemon API key가 없어도 실행된다. 재처리/대조에는 같은 store의 Lemon API 설정이 필요하다.

최소 운영 담당자를 지정해 장애 때 위 상태 조회를 수행한다. 자동 모니터링을 연결할 때는 `status --check`의 조회 결과/종료 코드를 알림 시스템에 연결하고, `--apply` 자동 실행은 별도 승인 없이 구성하지 않는다. 정상 처리 중인 짧은 `processing`도 종료 코드 2에 포함되므로 수신함의 lease/시간을 보고 장애 여부를 판단한다. 최근 100건만 보는 조회로 전체 주문 정합성을 보장할 수 없으므로 결제 대시보드의 누락 의심 주문 ID를 지정해 대조한다. 로그의 event ID·order ID·reason으로 수신함과 추적한다. PII가 들어 있는 수신함의 보관 기간과 삭제 정책은 운영자가 정한다. `003`은 서비스 역할에 SELECT/INSERT/UPDATE만 부여하고 DELETE/TRUNCATE는 부여하지 않으므로, 보관 기간 만료 데이터의 관리·삭제는 별도 관리자 절차와 권한으로 설계한다.

## Production 전환 직후 관찰

전환 직후, 15분 후, 1시간 후 담당자가 다음 결과와 관찰 시각을 기록한다. 예약 작업은 이번에 생성하지 않았다. 아래는 모두 조회/dry-run이며 `--apply`를 넣지 않는다. 실행 환경에는 위 서버용 변수들을 비밀 관리 수단으로 주입해야 하고 CLI는 `.env.local`을 자동으로 읽지 않는다. `farmverb_order_id`에는 Lemon 대시보드에서 이 store의 실제 Live 주문임을 확인한 ID만 지정한다. Test 3건은 Live 대조 대상이 아니며, NFR·미매핑 건을 일반 유료 주문으로 가정해 일괄 대조/재처리하지 않는다. 기존 8건의 DB 보존 검사는 모두 수행한다.

```sh
npm run payments:recovery -- status --check
npm run payments:recovery -- status --order-id "$farmverb_order_id"
npm run payments:recovery -- reconcile --order-id "$farmverb_order_id"

# 정확한 Production deployment의 요청/함수 로그를 조회한다.
vercel logs --deployment "$farmverb_release_url" --since 1h --limit 100
```

`status --check`의 종료 코드 2는 검토할 이벤트 존재, 1은 실행 오류다. 신규 수신함에 아직 이벤트가 없거나 기존 8건에 이벤트가 없다고 migration 실패로 판단하지 않는다. 과거 주문의 수신함 자동 backfill은 없으며, exit 0·빈 수신함은 외부 주문 누락이 없다는 증거도 아니다. 배포 경계 이후 Lemon 주문 목록과 의심 주문 ID를 대조하고 필요 시 위 dry-run을 수행한다. 100건 제한 밖의 문제는 별도 기간/주문별 조회로 확인한다.

Vercel Project → Logs에서 새 배포와 이전 URL의 요청을 구분해 아래 경로/로그를 확인한다. CLI 조회 옵션은 [공식 logs 문서](https://vercel.com/docs/cli/logs)를 따른다. 로그 원문에는 운영 정보가 있을 수 있으므로 비밀값·이메일·라이선스 키를 채팅이나 공개 보고서에 붙이지 않는다.

| 대상 | 경로·로그와 판정 |
| --- | --- |
| 웹훅 | `/api/webhooks/lemon-squeezy`, `[Lemon Webhook] Payment processing failed.`, `Payment needs review.`. 5xx/격리 reason과 event ID를 수신함에 연결한다. Lemon dashboard delivery도 함께 확인한다. |
| 구매 조회 | `/api/account/purchases`, `[Account Purchases] Failed to link purchases.`, `Failed to load purchases.`. GET 자체에 계정 연결 UPDATE가 있으므로 무작위 고객 계정 호출을 읽기 전용 검증으로 취급하지 않는다. |
| 라이선스·다운로드 | `/api/account/purchases/<purchaseId>/licenses`, `/downloads`, `/licenses/<licenseId>/instances`; `[Purchase Licenses]`, `[Purchase Downloads]`, `[Purchase License Devices]`, `[Purchase Entitlements]` 오류와 5xx 확인. 기기 목록의 부분 실패는 전체 HTTP 200에서도 발생할 수 있다. |

복구 CLI에는 라이선스 정상 여부를 증명하는 명령이 없다. 로그가 조용하다는 이유만으로 PASS로 하지 않는다. 계정별 실제 표시 검증은 사용자가 지정한 본인 소유 구매와 로그인 계정으로 별도 승인 범위에서 확인하고, 키 활성화/기기 해제·환불·다운로드 POST는 임의로 실행하지 않는다. NFR·미매핑 건은 현재 분류를 보존하고 원래 기대 권한이 확인되기 전에는 정상 유료 상품으로 매핑하지 않는다. 이전 deployment URL도 운영 DB에 접근할 수 있으므로 domain 전환만으로 구 API가 차단됐다고 판단하지 않는다.

## GA4 정합성과 남아 있는 한계

이 절의 구 JS/API는 `d02ebca` 계열을 뜻한다. 권장 롤백 `2260fa1`에는 `/api/checkout/conversions`와 신규 복구 방식이 있으므로, 이 버전으로의 롤백을 API 부재 상황과 혼동하지 않는다. 다만 이미 열린 더 오래된 탭과 legacy `sent` 표식은 남아 있을 수 있다.

- 과거 주문은 일괄 재전송하지 않는다. 새 체크아웃 claim만 생성 후 72시간 안에 복구한다. `Checkout.Success`나 상품명·시간 유사성만으로 purchase를 만들지 않는다.
- 새 JS는 queue에 넣었다는 이유로 완료 처리하지 않는다. Google tag callback 뒤 채널별 ACK와 로컬 `processed` 표식을 저장한다. ACK 응답 실패 시 다음 방문에서 로컬 완료 표식으로 ACK를 재시도한다. **호환성 예외:** 구 JS가 queue 시점에 남긴 v1 `sent`도 재전송 방지를 위해 완료로 인정하고 새 callback 없이 ACK한다. 이 legacy 표식은 실제 전송 증거가 아니므로 해당 주문의 누락을 복구한다고 보장할 수 없다.
- 60초 lease는 신규 복구 API를 사용하는 탭 사이에 적용된다. 구 JS의 직접 전송은 이 lease를 사용하지 않는다. 구 JS는 새 `processed` 표식을 이해하지 못하므로, 구 성공 확인 경로가 다시 실행되면 같은 주문을 재전송할 수 있다. 이 경우에도 `transaction_id`는 유지되지만 실제 Google 중복 제거 여부는 대시보드로 확인해야 한다.
- callback은 Google 서버의 수신·보고서 집계를 증명하지 않는다. callback 직후 브라우저 종료와 ACK 실패가 겹치거나 저장소/네트워크가 모두 실패하면 재시도가 발생할 수 있다. 동일 `transaction_id`를 유지하지만 외부 집계까지 exactly-once를 보장한다고 보고하지 않는다.
- 고객이 계정 페이지로 돌아오지 않거나 72시간이 지나거나 추적을 차단한 경우에는 브라우저 복구로 집계를 보장할 수 없다. 계정 재방문에서 복구한 이벤트의 수집 시각/세션은 원래 구매 시각/광고 세션과 달라질 수 있다. 무방문 전환·원래 attribution 보장이 필요하면 동의·client/session 식별·서버 outbox/Measurement Protocol을 별도 설계한다.
- GA4 보고서와 주문 건수·금액·통화·transaction ID, Ads conversion action의 중복 설정을 실제 대시보드에서 확인해야 한다. 이번 테스트는 네트워크를 모킹했으며 실제 전환 이벤트를 보내지 않았다.

| 혼재 상황 | 구매/계정 및 분석 동작 |
| --- | --- |
| 구 API에서 체크아웃 시작 → 새 My Account 복귀 | 기존 claim은 `analytics_recovery_enabled=false`이고 구 응답에는 `claimId`가 없다. 계정 주문 조회와 정확한 주문 ID 확인은 가능하지만 신규 분석 복구에서는 제외된다. 구 JS에서 purchase를 보내지 못했다면 분석 공백이 남을 수 있다. 과거 claim을 일괄 opt-in하지 않는다. |
| 구 JS + 새 API | 추가 응답 필드는 구 JS와 호환되고 새 claim은 opt-in된다. 구 직접 전송과 새 탭의 복구가 겹칠 수 있으며, 구 `sent`가 남았다면 위 legacy ACK 예외가 적용된다. |
| 새 JS + 구 API / 앱 롤백 | 구 API에는 `/api/checkout/conversions`가 없어 새 JS 복구는 404를 받고 중지한다. 이 오류가 구매 내역·다운로드 조회를 막지는 않는다. 해당 기간에 구 API가 생성한 claim은 복구 opt-in되지 않는다. |
| 새 JS callback 후 구 JS로 복귀 | 구 JS가 신규 `processed` 표식을 무시하므로 기존 성공 확인 조건이 충족되면 같은 `transaction_id`가 다시 전송될 수 있다. |

배포·롤백 시각과 대상 앱 버전을 기록하고, 그 경계에서 시작·완료된 주문을 별도로 대조한다. 72시간은 claim 생성 시점부터이며 롤백이나 재방문으로 연장되지 않는다. Vercel의 실제 요청 라우팅·캐시·구버전 탭 처리 설정은 프로젝트별로 확인하며, 특정 설정이 이 혼재를 제거했다고 증거 없이 가정하지 않는다.

## 로컬 검증과 배포 후 남은 미검증 사항

```sh
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

자동 테스트는 합성 주문·계정·라이선스, 차단된 네트워크 mock 및 메모리 PostgreSQL을 사용한다. [PGlite](https://pglite.dev/docs/)는 개발 의존성이며 프로덕션 런타임에 추가되지 않는다. 이와 별도로 **무료 로컬 Supabase의 실제 Auth/PostgREST 37개가 통과**했다. 최종 48개 열·RLS·서비스 권한·RPC·guard catalog와 snapshot SQL도 실제 로컬 DB에서 확인했다. [실행 결과와 정확한 범위](payment-local-supabase-validation.md)를 따르며, 일부 동시 요청 통과를 모든 경합이나 managed cloud·Vercel 환경 검증으로 확대하지 않는다.

2026-10-14 운영 catalog·RLS·권한 검사와 데이터 보존 확인은 완료했다. 그 결과로 증명하지 않은 범위는 webhook 구독·재전송, 서로 다른 로그인/결제 이메일의 전체 흐름, 모바일·데스크톱 overlay/hosted 복귀, 기존 11개 상품·번들의 실제 파일/라이선스, 부분/전체 환불, GA4/Ads 수신, 실제 결제·다운로드 및 라이선스 활성화다. 이후 운영 설정 변화도 이 과거 결과로 확인했다고 보지 않는다. 운영 데이터나 실제 결제를 사용하는 검증은 별도 승인 후 수행한다.

저장소가 차단된 브라우저의 메모리 장바구니는 현재 탭 수명 동안만 유지된다. 라이선스 키 조회 자체나 필수 소유권 확인이 실패하면 계속 실패를 표시한다. 기기 목록만 실패한 경우에는 키를 유지하고 해당 목록을 재시도할 수 있다.

## Windows 인계

문서·진단 스크립트가 포함된 feature branch를 받은 뒤 저장소 폴더에서 실행한다. 아래 명령은 로컬 코드와 의존성을 준비하며 운영 DB나 도메인을 변경하지 않는다. Node 24 호환 환경을 사용한다(기존 검증 버전 24.8.0).

```sh
git fetch origin
git switch codex/p1-purchase-stability
git pull --ff-only
npm ci
```

`.env.local`과 Vercel/Supabase 로그인은 Git으로 전달되지 않으므로 비공개 경로로 따로 준비한다. 운영 snapshot CSV, `status.json`, 합성 비밀번호·claim hash가 포함된 `run.json`도 commit하지 않는다. macOS `/Users/...`, `/private/tmp/...`, Colima socket 경로는 당시 실행 기록이다. 로컬 Supabase harness를 다시 사용할 때는 **WSL2의 Linux 파일시스템과 Docker Linux 컨테이너**에서 새 격리 환경을 준비하고 POSIX 파일 권한 `0600` 검사를 유지한다. Windows 네이티브 환경의 동일 동작을 검증한 것으로 보지 않는다.

문서 동기화는 재배포 지시가 아니다. 운영 migration 001/002/003은 SQL Editor로 이미 적용했으며 migration history가 비어 있어도 재실행하지 않는다. DB 작업이 필요하면 적용 증거와 실제 schema를 먼저 대조한다.
