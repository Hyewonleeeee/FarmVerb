# 결제 안정화 staging 검증 절차

대상 코드: `32ae5f8`, 검증 기준일 2026-10-14. **무료 로컬 Supabase CLI + Docker의 실제 Auth/PostgREST 검증은 37/37 통과했다.** 유료 cloud staging은 사용하지 않았다. 이 문서는 추후 cloud 환경 차이를 추가 검증할 때만 사용하는 선택 절차다. 로컬 검증 이후 같은 날 운영 001→002→003 적용과 Production 전환을 완료했으며 실제 결제 검증은 수행하지 않았다. [로컬 실제 API 결과](payment-local-supabase-validation.md)와 [운영 실행 기록](payment-operations.md)을 구분해 읽는다. 현재 Production SHA를 재확인한 문서는 아니다.

## 확인된 정보와 검증 범위

다음은 2026-10-14 운영 적용 전 사용자 수동 확인 결과다. 이후 적용·보존 확인 결과는 운영 실행 기록을 따른다.

- BASELINE 컬럼 25개: `purchases` 16개 + `purchase_account_claims` 9개가 일치하며, constraints/index가 정상이고 신규 객체명 충돌이 없다. `purchases` 하나에 25개 컬럼이라는 뜻이 아니다.
- 구매 8건은 Test 3건·본인 구매 4건·NFR 1건이며 claim은 13건이다. 이상 집계 0, 미매핑 1건으로 보고되었다. **미매핑 1건과 NFR의 관계는 확인되지 않았다.** 고객 행을 staging에 복제하거나 이 숫자로 관계를 추정하지 않는다.
- 당시 백업 존재, Vercel Production branch `main`, 자동 domain 배정 Enabled가 보고되었다. 이후 운영 배포 때 Disabled로 저장했다. 이 선택적 cloud 절차 자체에는 운영 `main` push, production promotion, 운영 migration이나 branch/history 초기화가 포함되지 않는다.

기존 PGlite 테스트와 별도로 로컬 실제 Auth/PostgREST에서 baseline 4/4, `001` 11/11, `002` 11/11, `003` 11/11을 확인했다. 구 SDK 쿼리 형태와 신규 RPC를 검증한 결과이며 Next.js route 전체 E2E 통과를 뜻하지 않는다. 아래 cloud 절차 전체나 운영 환경을 PASS로 확대 해석하지 않는다. 운영 절차와 롤백 기준은 [payment-operations.md](payment-operations.md)를 따른다.

## 1. 연결 및 schema 격리

1. 추후 cloud 검증이 필요한 경우에만 운영과 다른 **독립 staging 프로젝트**를 명시적으로 선택한다. project reference와 API origin을 기록하고 운영 reference와 다름을 확인한다. 운영 branch clone·고객 데이터 복사·운영 migration 이력 초기화로 staging을 만들지 않는다.
2. 관리자 DB/SQL Editor, staging 서버 키, staging anon 키를 구분한다. 키·비밀번호·JWT는 비밀 관리 수단으로 전달하며 채팅·문서·명령줄 인자·로그에 적지 않는다. 운영 `.env.local`을 자동 로드하거나 운영 키로 fallback하지 않는다.
3. DB webhook, custom trigger, Auth hook, 이메일 발송, cron 등 외부 동작을 먼저 확인한다. 운영 Lemon·GA·라이선스 endpoint나 운영 SMTP로 이어지는 설정을 복사하지 않는다. 격리를 위해 변경한 설정은 차이 목록에 남긴다. 검증 클라이언트의 외부 호출은 지정 staging의 PostgREST/Auth origin으로 제한한다.
4. [schema preflight](../scripts/payment-schema-preflight.sql)의 구조 정보를 사용해 타입·nullable/default·unique/FK·index·custom RLS·grant·함수/trigger·role 특성을 비교한다. BASELINE 컬럼 일치만으로 전체 동등성을 선언하지 않는다. 해시/마스킹 결과만으로 custom SQL을 재구성하지 말고 필요한 정의를 비밀값 제외 상태로 검토한다.
5. Supabase가 관리하는 `auth.users`·역할을 사용한다. 로컬 PGlite fixture처럼 `auth.users`를 단순 테이블로 다시 만들지 않는다. 운영 custom schema를 재현하지 못한 항목은 명시적으로 미검증으로 남긴다.

## 2. 적용 파일과 단계별 확인

선택한 cloud staging에서 추가 검증할 경우 **새 격리 환경의 빈 DB에만** 기존 schema를 아래 순서로 준비하고, 필요한 운영 custom schema 차이를 반영한다. 고객 데이터는 넣지 않는다. 운영 DB에는 001/002/003이 이미 적용되어 있으므로 migration history가 비어 있다는 이유로 이 절차를 재실행하지 않는다.

1. `supabase/migrations/202607130001_create_purchases.sql`
2. `supabase/migrations/202609210001_create_purchase_account_claims.sql`
3. `supabase/migrations/202609210002_reload_postgrest_schema.sql`

그다음 아래 표 순서로 적용한다. SQL Editor에서는 파일 전체를 실행하고 각 파일의 `BEGIN`/`COMMIT`을 유지한다. 오류가 나면 다음 단계로 넘어가지 않는다. 로컬 CLI/Docker 준비와 cloud 관리자 접속 권한은 별개다. cloud에서 CLI를 사용하는 경우에도 연결 정보를 명령줄에 노출하지 않는다.

| 단계 | 적용 파일 | commit 후 확인 |
| --- | --- | --- |
| BASELINE | 위 기존 파일 3개 + 검토한 custom schema | 운영과의 구조 차이 기록. 합성 정상 주문의 서비스 조회/쓰기 기준 결과 확보. |
| 001 | `supabase/migrations/202610130001_payment_event_recovery.sql` | **이 단계 직후** owner/refund/claim_review 보호 및 정상 이메일 연결 확인. 신규 guard/grant/policy가 이미 있어야 함. 분석 lease RPC는 아직 없음. |
| 002 | `supabase/migrations/202610130002_analytics_checkout_recovery.sql` | 기존 보호 유지, 분석 컬럼/RPC가 PostgREST에 보임, 분석 lease 및 역할 제한 확인. |
| 003 | `supabase/migrations/202610130003_purchase_write_guards.sql` | 동일 guard 유지, 실제 API 시나리오 재확인, 아래 읽기 전용 schema 검사 통과. |

마지막으로 [payment-schema-check.sql](../scripts/payment-schema-check.sql) 전체를 관리자 SQL 세션에서 실행한다. 이 검사는 catalog/RLS/grant/trigger 조건을 확인하고 rollback하며, 합성 동작·실제 PostgREST·외부 서비스 검증을 대신하지 않는다. `003` 재적용 가능성을 `001` 전체 재실행 허용으로 해석하지 않는다. 이미 이전 migration을 적용한 환경에 대한 절차는 운영 문서의 이력별 표를 따른다.

## 3. 합성 fixture 준비

새 프레임워크 없이 설치된 `@supabase/supabase-js`와 기존 [호환성 fixture](../supabase/migrations/paymentCompatibility.test.mjs), [RPC fixture](../supabase/migrations/paymentRecovery.test.mjs)의 입력 형태를 사용한다. 로컬 SQL adapter 대신 **실제 staging SDK 클라이언트**를 연결한다. 앱 전체를 띄우거나 실제 체크아웃·웹훅·GA 경로를 호출할 필요가 없다.

- Auth 사용자 A/B를 staging 전용으로 준비한다. 생성이 필요하면 초대/OTP 이메일을 보내는 경로 대신, 외부 hook 격리를 확인한 관리자 경로로 합성 사용자를 만든다. 실제 사용자 ID·이메일을 사용하지 않는다.
- 매 실행마다 `runUUID`를 정하고 주문 ID는 `audit-staging-<runUUID>-<case>`처럼 실제 주문과 구별한다. 이메일은 합성 주소, 상품/variant 조합은 저장소 fixture의 일관된 조합을 사용한다. `download_url`, `lemon_license_key`에 실제 값은 넣지 않는다.
- SQL RPC 검증용 주문은 `testMode: false`, 직접 테이블 행은 `test_mode: false`가 필요하다. 이는 **격리 staging의 합성 Live 표식**이며 실제 Live 결제를 뜻하지 않는다. `paid`, `partial_refund`, `refunded`, `fraudulent`는 별도 합성 행으로 준비한다.
- 분석 claim은 현재 시각 기준 생성·만료 시각, 고유 64자리 hash, A의 ID, 일치하는 variant/order ID, `consumed_at`/`consumed_order_id` 쌍, `analytics_recovery_enabled: true`를 사용한다. 실제 claim 토큰을 복사하지 않는다.
- 생성한 사용자·purchase·claim·event UUID와 주문 ID를 실행 manifest에 기록한다. 비밀번호·키·JWT는 제외한다. service/anon/authenticated 클라이언트는 분리하며 자동 세션 저장·갱신을 끈다. 사용자 A JWT의 정상 여부를 먼저 확인한다.

위 manifest 규칙은 이 선택적 cloud 절차의 인계용 기록에 적용한다. 이미 실행한 로컬 harness의 비공개 manifest는 재실행용 합성 비밀번호와 `token_hash`를 포함하며 권한 `0600`으로 보관한다. 원문을 공유하지 않고 별도 결과 요약만 인계한다.

## 4. 실제 PostgREST 확인표

`from()`은 실제 `/rest/v1/<table>`, `rpc()`는 `/rest/v1/rpc/<function>`을 호출해야 한다. 검증마다 **service 클라이언트로 해당 합성 행을 재조회**한다. HTTP 200, 영향 행 수, CLI exit 0만으로 성공 판정하지 않는다.

| 검증 | API 작업 | 기대 결과 |
| --- | --- | --- |
| 기존 owner·환불 | `purchases.upsert(row, { onConflict: 'lemon_order_id' })`로 A의 환불 주문에 B·paid 제출 | owner A와 기존 환불 상태 유지. partial/fraudulent도 각각 유지. |
| 정상 이메일 연결과 review | 구 API와 같은 `user_id IS NULL`·이메일·상태·Live·variant 필터의 UPDATE로 정상 행과 review 행 처리 | `email_allowed`는 연결, `claim_review`는 미연결 유지. 대량 UPDATE 전체를 오류로 막지 않음. |
| claim 증거 | review 주문에 다른 사용자/variant/주문 증거 제출 후 정확한 소비 claim으로 연결 시도 | 잘못된 증거는 연결되지 않고 정확한 order/user/variant 일치만 허용. |
| 상태·금액 회귀 | paid에 pending/failed snapshot 제출 | paid와 기존 금액/통화 보존. |
| identity 변경 | 기존 id/order/variant/test_mode/non-null product slug 변경 시도 | SQLSTATE `22023`, 기존 행 유지. 정상 owner 충돌의 값 보존과 구분. |
| 신규 저장 RPC | `persist_payment_purchase(p_order,p_status,p_product_slug,p_user_id,p_link_status)` 반복 | 같은 주문 1개, owner·환불 보호 유지, 서비스 역할 정상 실행. |
| 수신함 lease | 합성 pending event에 `claim_payment_webhook_event(p_event_id,p_allow_quarantined:false)` 동시 2회 | 하나만 event/lease 반환, 다른 결과 null. |
| 분석 lease | 잘못된 사용자로 `lease_purchase_analytics(p_claim_id,p_user_id,p_lease_token)` 호출, 이후 A로 다른 token의 동시 2회 | 잘못된 사용자 false, A 요청은 true 하나만. 합성 행의 lease 만료 시각을 과거로 바꾼 뒤 재획득 가능. |
| 브라우저 역할 | anon과 유효한 A JWT로 purchases/claims/inbox SELECT·INSERT·UPDATE 및 세 RPC 호출 | 합성 행 노출·변경 없음. 서비스 역할의 같은 정상 작업은 성공해야 함. |

브라우저 SELECT/UPDATE는 권한 오류 또는 RLS에 의한 빈 결과일 수 있다. 실제 데이터가 없는 조회를 성공적인 차단으로 오인하지 않도록 서비스로 존재를 먼저 확인한다. RPC의 인증/권한 오류와 schema cache 미반영·서버 오류를 구분한다. API 응답의 status·안전한 error code·기대값 일치 여부만 기록하고 전체 응답/인증 헤더를 출력하지 않는다.

권한 검증을 통과시키려고 서비스 DELETE/TRUNCATE나 브라우저 grant를 추가하지 않는다. RPC 이름이 보이지 않으면 migration commit과 PostgREST schema reload 상태를 확인하며, 권한을 넓혀 우회하지 않는다. GA callback/ACK나 실제 라이선스 활성화는 이 SQL/API 검증 범위에 포함하지 않는다.

## 5. 정리 및 결과 인계

HTTP 요청 여러 개는 하나의 transaction rollback으로 취소되지 않는다. 성공·실패와 무관하게 manifest를 보존하고, staging 관리자 DB 세션에서 **해당 fixture UUID/주문 ID만** 정리한다. purchases·claims·events를 먼저 확인/정리한 뒤 합성 Auth 사용자를 관리자 경로로 삭제한다. 서비스 DELETE 권한을 임시로 부여하거나 전체 테이블을 비우지 않는다. 실패로 남은 fixture는 다음 담당자에게 명시한다.

결과에는 staging project reference, 기준 commit, 적용 파일/단계/시각, 운영 schema와의 차이, 표의 실제 API 결과, 정리 여부를 남긴다. 비밀값과 고객 행은 포함하지 않는다. 항목별로 `PASS`(기대 API 결과 확인), `FAIL`(실제 불일치), `미검증`(연결·권한·구조 정보 부족)을 구분한다. **로컬 실제 API 37개는 PASS이며, 이 cloud 절차는 미실행**이다. 완료된 개별 범위는 [로컬 결과](payment-local-supabase-validation.md)에 한정하고 위 표 전체를 일괄 PASS로 표시하지 않는다.

이 검증이 완료되어도 운영 PostgREST 설정, 실제 결제·다운로드·라이선스, GA4/Ads 수신이나 Vercel 배포를 완료한 것은 아니다. 다음 작업은 결과와 [운영 절차](payment-operations.md)를 확인해 진행하며, 이 문서 자체가 운영 변경을 승인하거나 실행하지 않는다.
