# 결제 안정화 배포·운영 절차

이 문서는 F01–F07 수정 코드의 배포와 장애 대응 절차다. 이번 작업에서는 운영 migration, 주문 복구, 라이선스 변경, 실제 결제 및 프로덕션 배포를 실행하지 않는다.

## 변경 구조와 순서

1. 서명·이벤트명·Live Mode·store 검증을 통과한 웹훅을 `payment_webhook_events`에 먼저 기록한다. 원본 payload/서명/원문 claim 토큰은 저장하지 않는다. 정규화 주문에는 고객 이메일이 포함되므로 이 테이블도 고객 데이터로 관리한다.
2. 중복 event key와 2분 lease로 처리 작업을 제한한다. `purchases.lemon_order_id` 유일성과 원자적 SQL 병합으로 중복 주문·환불 상태 역전·기존 소유자 변경을 막는다.
3. 새 계정 claim은 24시간 유효하다. 수신 시각 대신 서명된 **주문 생성 시각**으로 유효기간을 확인하므로 지연 웹훅을 복구할 수 있다. 생성 시각 하한에는 작은 시계 오차 허용치가 있고 만료 상한은 유지한다.
4. 유효하지 않은 claim은 `claim_review`로 보류한다. 결제 이메일이 같아도 자동 지급하지 않는다. claim 없는 정상 주문의 이메일 연결은 확인된 이메일과 `email_allowed` 조건을 모두 요구한다.
5. 미등록 variant는 `quarantined/unmapped_variant`에 남긴다. 상품 매핑 검토·배포 후 같은 이벤트를 재처리한다. 임의 상품 지급은 하지 않는다.
6. 새 체크아웃의 claim만 분석 복구 대상으로 기록한다. My Account가 본인 소유의 Live·paid·공식 variant 주문을 조회하고 정확한 주문 ID를 `transaction_id`로 사용한다. 60초 lease, 채널별 callback ACK, 기존 로컬 중복 표식을 함께 사용한다.
7. 라이선스 키의 필수 소유권 검증은 유지하고, 부가 상품명·기기 조회 장애만 분리한다. 저장소 장애는 계정별 탭 메모리 장바구니로 대체한다.

F01(계정 연결), F03(미등록 variant), F04(복구)는 같은 수신함과 F02의 원자적 주문 저장에 의존한다. F06은 계정 claim과 검증된 주문을 사용한다. 따라서 SQL migration을 먼저 적용해야 한다. F05와 F07은 별도로 동작하지만 함께 배포·검증한다.

## 배포 전 환경 확인

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 대상 환경이 올바른지 확인.
- 서버 전용 `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`: 새 테이블과 RPC를 사용할 수 있는 자격증명. `NEXT_PUBLIC_` 접두어를 붙이지 않는다.
- `LEMON_SQUEEZY_WEBHOOK_SECRET`, `LEMON_STORE_ID`, `LEMON_API_KEY`: 같은 Live store의 값인지 확인. API key는 주문·라이선스 조회와 기존 환불 비활성화 권한이 필요하다.
- Lemon Squeezy webhook URL과 `order_created`, `order_refunded` 구독, 체크아웃 후 계정 복귀 URL을 대시보드에서 확인. 이 저장소만으로 대시보드 설정은 검증되지 않는다.
- `lib/products/catalog.ts`의 기존 11개 Live variant, checkout URL, 두 번들 구성을 대시보드와 대조한다. 이번 변경은 카탈로그·가격·번들 지급 규칙을 바꾸지 않는다.
- GA4/Ads 설정은 기존 `lib/analytics/config.ts`를 사용한다. 새 MP secret이나 서버 전송기는 추가하지 않았다. 로컬·preview 호스트는 구매 복구 전송을 실행하지 않는다.
- 운영 CLI와 테스트는 Node 24.8.0에서 검증한다. CI도 호환 Node를 지정한다. 자격증명은 승인된 비밀 저장소나 세션 환경으로 주입하고 shell history에 값을 적지 않는다. CLI가 `.env.local`을 자동으로 읽지는 않는다.

## migration 및 배포 순서

1. 운영 적용은 별도 승인 후 진행한다. 먼저 **별도 staging Supabase**에서 기존 migration 상태, 백업/복원 수단, 기존 RLS·grant·custom trigger를 확인한다.
2. 기존 migration 세 개가 적용되어 있는지 확인한다. 새 SQL은 아래 순서대로 각 한 번 적용한다.
   - `supabase/migrations/202610130001_payment_event_recovery.sql`
   - `supabase/migrations/202610130002_analytics_checkout_recovery.sql`
3. 새 컬럼·테이블·RPC 및 PostgREST schema reload를 확인한다. 브라우저 anon/authenticated 역할이 수신함과 변경 RPC에 접근할 수 없어야 한다.
4. 첫 migration은 기존 `user_id`가 있는 행의 **연결 분류만** `linked`로 표시한다. 주문 소유자·권한·금액을 재배정하지 않는다. 기존 미연결 주문은 기존 이메일 연결 방식이 유지된다. 이전 결함으로 생긴 잘못된 연결/누락은 자동 추정·일괄 수정하지 않는다.
5. migration 완료 후 앱을 배포한다. schema 없이 새 앱을 먼저 배포하면 체크아웃 생성·웹훅 저장·계정 조회가 실패할 수 있다.
6. staging의 격리된 합성 데이터로 체크아웃→웹훅→계정→다운로드/라이선스→분석 callback까지 검증한다. Live allowlist 때문에 운영 webhook은 Test Mode 이벤트를 계속 무시한다. 테스트를 위해 운영 store/variant 검사를 해제하지 않는다.
7. 승인된 실제 결제 검증은 별도 일정으로 수행한다. 배포 직후 웹훅 오류·격리 이벤트·주문 대조 결과를 관찰한다.

DDL은 추가형이다. 장애 시 데이터를 삭제하는 down migration을 실행하지 않는다. 이전 앱으로 되돌리면 이전 상태 역전·email fallback 결함도 돌아오므로, checkout 유입 제한/웹훅 재전송 계획을 포함해 롤백을 판단한다. 새 수신함·연결 분류·분석 ACK는 보존한다.

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
| `processed` | 해당 이벤트 처리 완료. 결제 자체와 계정 지급 성공을 동일시하지 말고 `reconcile`의 providerStatus/purchaseStatus/accountLinked도 확인한다. |
| `pending`, `failed` | 서버/DB/API 오류를 해결한 뒤 같은 event ID를 replay한다. 이미 저장된 주문이나 소비된 같은-order claim은 중복 처리된다. |
| `processing` | 처리 중. 2분 lease가 지난 뒤에도 남으면 작업 중단 가능성을 확인하고 replay한다. 활성 worker의 lease는 빼앗지 않는다. |
| `unmapped_variant` | Live 대시보드에서 상품을 확인하고 명시적 카탈로그 매핑 변경을 검토한다. 매핑 후 해당 이벤트 replay. |
| `claim_expired`, `claim_invalid`, `claim_reused`, `claim_variant_mismatch` | 원래 계정 연결 증거를 확인한다. 이메일만으로 다른 계정에 지급하지 않는다. 만료된 실제 주문의 소유권 재지정은 별도 지원 검토가 필요하며 CLI는 임의 사용자 지정 기능을 제공하지 않는다. |
| `reconciliation_owner_review`, `ownership_conflict`, `account_review_required` | 주문 존재는 확인해도 계정 귀속을 자동 결정하지 못한 상태. 기존 owner를 보존하고 담당자가 근거를 검토한다. |

`reconcile --apply`는 merchant API에서 읽은 실제 주문을 저장 이벤트 처리기에 넘긴다. 수신함에 원래 claim 증거가 있으면 재사용한다. 원래 웹훅이 전혀 도착하지 않았고 owner 증거도 없으면 자동 이메일 연결을 하지 않는다. 미등록 상품도 검토 상태로 남는다.

환불 이벤트 replay/reconcile의 `--apply`는 기존 검증 절차에 따라 **완전 환불 주문의 라이선스를 비활성화할 수 있다.** 현재 provider 주문·store·mode·환불 상태를 다시 확인한 뒤만 실행한다. 부분 환불은 기존 권한을 유지한다. 키별 처리 중 실패하면 같은 이벤트를 재실행하며 이미 비활성화된 키는 성공으로 취급한다.

`status`는 Supabase 서버 자격증명만 필요하며 Lemon API key가 없어도 실행된다. 재처리/대조에는 같은 store의 Lemon API 설정이 필요하다.

최소 운영 담당자를 지정해 장애 때 위 상태 조회를 수행한다. 자동 모니터링을 연결할 때는 `status --check`의 조회 결과/종료 코드를 알림 시스템에 연결하고, `--apply` 자동 실행은 별도 승인 없이 구성하지 않는다. 정상 처리 중인 짧은 `processing`도 종료 코드 2에 포함되므로 수신함의 lease/시간을 보고 장애 여부를 판단한다. 최근 100건만 보는 조회로 전체 주문 정합성을 보장할 수 없으므로 결제 대시보드의 누락 의심 주문 ID를 지정해 대조한다. 로그의 event ID·order ID·reason으로 수신함과 추적한다. PII가 들어 있는 수신함의 보관 기간과 삭제 정책은 운영자가 정한다.

## GA4 정합성과 남아 있는 한계

- 과거 주문은 일괄 재전송하지 않는다. 새 체크아웃 claim만 생성 후 72시간 안에 복구한다. `Checkout.Success`나 상품명·시간 유사성만으로 purchase를 만들지 않는다.
- queue에 넣었다는 이유로 완료 처리하지 않는다. Google tag callback 뒤 채널별 ACK를 저장한다. ACK 응답 실패 시 다음 방문에서 로컬 완료 표식으로 ACK를 재시도한다. 동시 탭에는 lease를 적용한다.
- callback은 Google 서버의 수신·보고서 집계를 증명하지 않는다. callback 직후 브라우저 종료와 ACK 실패가 겹치거나 저장소/네트워크가 모두 실패하면 재시도가 발생할 수 있다. 동일 `transaction_id`를 유지하지만 외부 집계까지 exactly-once를 보장한다고 보고하지 않는다.
- 고객이 계정 페이지로 돌아오지 않거나 72시간이 지나거나 추적을 차단한 경우에는 브라우저 복구로 집계를 보장할 수 없다. 계정 재방문에서 복구한 이벤트의 수집 시각/세션은 원래 구매 시각/광고 세션과 달라질 수 있다. 무방문 전환·원래 attribution 보장이 필요하면 동의·client/session 식별·서버 outbox/Measurement Protocol을 별도 설계한다.
- GA4 보고서와 주문 건수·금액·통화·transaction ID, Ads conversion action의 중복 설정을 실제 대시보드에서 확인해야 한다. 이번 테스트는 네트워크를 모킹했으며 실제 전환 이벤트를 보내지 않았다.

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
