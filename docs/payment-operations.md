# 결제 안정화 배포·운영 절차

이 문서는 F01–F07 수정 코드의 배포와 장애 대응 절차다. 이번 작업에서는 운영 migration, 주문 복구, 라이선스 변경, 실제 결제 및 프로덕션 배포를 실행하지 않는다.

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

이번 Vercel Project Settings/Git 읽기 전용 확인은 로그인 화면에서 중단되었다. **Production branch, 자동 domain 배정, 실제 rollback deployment와 환경변수 조합은 확인 불가**다. 저장소의 branch 이름이나 빌드 성공으로 이를 PASS 처리하지 않는다. 운영 schema/RLS·Lemon Squeezy·GA4/Ads 설정도 실제 조회 근거가 없는 항목은 미확인으로 유지한다.

## migration 및 배포 순서

1. 운영 적용은 별도 승인 후 진행한다. 먼저 **별도 staging Supabase**에서 기존 migration 상태, 백업/복원 수단, 기존 RLS·grant·custom trigger를 확인한다.
2. 기존 migration 세 개와 `001`/`002`의 적용 이력을 확인한다. 아직 새 SQL을 적용하지 않은 환경은 아래 순서대로 각 한 번 적용한다. 이미 적용한 환경은 아래 표에 따라 미적용 파일만 적용한다.
   - `supabase/migrations/202610130001_payment_event_recovery.sql`
   - `supabase/migrations/202610130002_analytics_checkout_recovery.sql`
   - `supabase/migrations/202610130003_purchase_write_guards.sql`
3. 각 파일의 `BEGIN`/`COMMIT` 전체를 실행하고 runner는 오류 발생 시 중단해야 한다. 현재 `001`은 guard/grant/policy를 같은 transaction의 COMMIT 전에 설치해, 새 분류만 공개되고 구 API 보호는 아직 없는 중간 상태를 만들지 않는다. `002`도 명시적 transaction 안에서 함수 생성과 `REVOKE`를 함께 commit한다. SQL 편집기에서 일부 문장만 골라 실행한 결과를 완료로 간주하지 않는다.
4. 새 컬럼·테이블·RPC·`003` trigger/policy 및 PostgREST schema reload를 확인한다. 브라우저 anon/authenticated 역할이 수신함과 변경 RPC, 구매·claim 테이블의 직접 읽기/쓰기에 접근할 수 없어야 한다. `003`의 restrictive RLS policy가 기존 permissive policy와 함께 동작하는지 확인한다. 서비스 역할의 SELECT/INSERT/UPDATE는 유지하며 구 API와 신규 RPC의 정상 주문 처리를 모두 검증한다.
5. 첫 migration은 기존 `user_id`가 있는 행의 **연결 분류만** `linked`로 표시한다. 주문 소유자·권한·금액을 재배정하지 않는다. 기존 미연결 주문은 기존 이메일 연결 방식이 유지된다. 이전 결함으로 생긴 잘못된 연결/누락은 자동 추정·일괄 수정하지 않는다.
6. 신규 적용 환경은 **현재 `001` commit 직후** 구 직접 쓰기 보호가 활성화되어 `002`/`003` 사이에도 유지된다. 이전 `2260fa1`판 `001`을 적용한 환경은 `003`으로 이 보호를 추가한다. 미적용 migration의 commit과 아래 호환성 검증 완료 후 앱을 배포한다. schema 없이 새 앱을 먼저 배포하면 체크아웃 생성·웹훅 저장·계정 조회가 실패할 수 있다. 실제 Vercel Production branch와 자동 domain 배정 설정을 확인해 schema 완료 전에 git push나 promotion이 프로덕션 전환을 일으키지 않도록 배포 순서를 정한다.
7. staging의 격리된 합성 데이터로 체크아웃→웹훅→계정→다운로드/라이선스→분석 callback까지 검증한다. Live allowlist 때문에 운영 webhook은 Test Mode 이벤트를 계속 무시한다. 테스트를 위해 운영 store/variant 검사를 해제하지 않는다. staging 호스트에서는 구매 분석 복구가 실행되지 않으므로, callback 검증은 네트워크가 차단된 production-host mock으로 수행하고 실제 Google 수신 검증과 구분한다.
8. 승인된 실제 결제 검증은 별도 일정으로 수행한다. 배포 직후 웹훅 오류·격리 이벤트·주문 대조 결과를 관찰한다.

| 확인된 DB 적용 이력 | 적용 절차 |
| --- | --- |
| 기존 migration 세 개만 적용, `001`/`002` 미적용 | 현재 `001` 전체를 한 번 적용하고 guard 활성화를 확인한 뒤 `002`→`003` 적용. |
| 이전 `2260fa1`판 `001`만 적용 | `001` 재실행 없이 현재 `002`와 `003` 적용. 구 직접 쓰기 보호는 `003` commit 후 확인. |
| 이전 `2260fa1`판 `001`/`002` 적용 | 기존 이력을 유지하고 `003` 추가 적용. `001`/`002`를 새 내용으로 재실행하지 않음. |
| 현재 `001` 또는 `003`까지 적용하다 중단 | 적용 이력·commit 여부·guard 존재를 확인한 뒤 미완료 단계부터 판단. `003`의 재적용 가능성을 `001` 전체 재실행 허용으로 해석하지 않음. |

현재 `001` 파일은 최초 배포의 transaction 공백을 막기 위해 guard/grant/policy를 포함하도록 보강했다. **이미 실행한 이전 `001`의 이력은 수정·삭제하지 않는다.** 적용된 버전의 기록을 보존하고 추가 migration `003`으로 보강한다. `003`은 현재 `001`과 동일한 guard를 재확인하며 함수·trigger·policy 교체를 재적용할 수 있지만, 운영 실행 전에는 적용 이력과 실패 지점을 확인한다.

psql로 적용한다면 각 파일의 명시적 transaction을 그대로 실행하고 `ON_ERROR_STOP`으로 오류 시 중단한다. 승인된 대상 DB의 libpq 연결 환경을 비밀 관리 수단으로 먼저 지정하고 대상 DB 식별을 확인한다. URL·비밀번호를 명령줄 인자나 문서에 적지 않는다. 아래는 `001`이 성공한 다음 실행할 `002` 예시이며 **DB를 변경한다.** 이 문서를 작성하면서 실행하지 않았고, 이미 적용한 migration을 임의로 반복하는 용도로 사용하지 않는다.

```sh
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --file=supabase/migrations/202610130002_analytics_checkout_recovery.sql
```

파일 적용 기록만으로 검증을 끝내지 않는다. 같은 DB에서 `lease_purchase_analytics(uuid,uuid,uuid)`의 anon/authenticated 실행 권한이 false, service_role 실행 권한이 true인지 조회하고, 실제 서비스 자격증명의 PostgREST 호출도 staging의 합성 claim으로 확인한다. transaction 적용이나 권한 검증에 실패하면 신규 앱 promotion을 진행하지 않는다. 실패한 단계·commit 여부를 먼저 확인하고 이미 commit된 파일 전체를 무조건 재실행하지 않는다.

`003` 적용 후 승인된 DB 세션에서 아래 **읽기 전용 schema 검사**를 실행한다. 동일한 libpq 연결 환경을 사용하고 자격증명을 출력하지 않는다. 테이블·RLS·RPC·trigger·grant의 존재와 요구 조건을 assert하는 검사이며, 합성 주문 동작·동시성·실제 서비스 키의 PostgREST 호출을 대신하지 않는다. 이 문서의 명령 예시는 운영에서 실행했다는 증거가 아니다.

```sh
psql -X --set=ON_ERROR_STOP=1 --file=scripts/payment-schema-check.sql
```

## 구 API 호환성 검증과 앱 롤백

권장 운영 롤백 기준은 **앱 `2260fa1` + 보강된 DB 유지**다. 이 commit은 원격 저장소에 있고 이전 로컬 build를 통과했으며, 신규 수신함·claim 검증·분석 복구 API를 유지한다. 다만 이것이 Vercel production rollback artifact 준비를 증명하지는 않는다. **승인된 배포 단계에서** 대응 deployment ID, production rollback 사용 가능 여부와 환경변수 조합을 확인한다. 현재 artifact의 존재/부재를 추정하지 않는다.

더 오래된 **`d02ebca`는 구 API가 계속 실행되는 경우와 최악의 롤백에 대비한 DB 호환성 테스트 대상이며 권장 운영 롤백이 아니다.** DB guard가 구 API 요청까지 처리하므로 구 서비스 키의 권한 회수나 구 API 차단을 정상 운영의 전제로 두지 않는다. 아래는 별도 staging의 합성 데이터로 수행할 절차이며, 로컬 테스트 통과를 운영 검증 완료로 표기하지 않는다.

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

## 로컬 검증과 출시 전 미검증 사항

```sh
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

자동 테스트는 합성 주문·계정·라이선스, 차단된 네트워크 mock 및 메모리 PostgreSQL을 사용한다. [PGlite](https://pglite.dev/docs/)는 개발 의존성이며 프로덕션 런타임에 추가되지 않는다. SQL 실행 테스트는 migration, 상태 병합, role 권한, lease를 확인하지만 실제 Supabase PostgREST·멀티프로세스 동시성·배포 플랫폼 제한까지 검증하는 것은 아니다.

출시 전 남은 확인: 운영 schema drift/RLS와 서비스 키 권한, webhook 구독·재전송, 서로 다른 로그인/결제 이메일, 모바일·데스크톱 overlay/hosted 복귀, 기존 11개 상품·번들 파일/라이선스, 부분/전체 환불, GA4/Ads 수신, 실제 결제·다운로드 및 라이선스 활성화. 운영 데이터나 실제 결제를 사용하는 검증은 별도 승인 후 수행한다.

저장소가 차단된 브라우저의 메모리 장바구니는 현재 탭 수명 동안만 유지된다. 라이선스 키 조회 자체나 필수 소유권 확인이 실패하면 계속 실패를 표시한다. 기기 목록만 실패한 경우에는 키를 유지하고 해당 목록을 재시도할 수 있다.
