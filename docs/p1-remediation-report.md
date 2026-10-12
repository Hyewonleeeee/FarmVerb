# FarmVerb F01–F07 로컬 수정 보고서

작업 기준: 원격 `origin/main`의 `d02ebca`를 반영한 `codex/p1-purchase-stability`. 기존 로컬 main보다 앞선 두 footer 변경을 포함해 시작했고, 커밋 전 다시 fetch하여 원격 main에 추가 변경이 없음을 확인했다. 기존 `.DS_Store` 변경은 제외한다.

실제 결제, 운영 Supabase migration/주문 변경, 라이선스 변경, 프로덕션 배포는 실행하지 않았다. 아래의 검증 완료는 합성 데이터와 로컬 환경에 한한다.

| 결함 | 수정 내용 | 주요 변경 파일 | 로컬 검증 | 남아 있는 위험·수동 확인 |
| --- | --- | --- | --- | --- |
| F01 계정 미연결 | 새 claim TTL 24시간, 수신 시각 대신 서명된 주문 생성 시각 확인. claim 실패는 검토 상태로 저장하고 청구 이메일 자동 연결 차단. 이메일 fallback은 확인된 이메일에만 허용. | `lib/checkout/accountClaim.ts`, `accountClaim.server.ts`, `app/api/account/purchases/route.ts`, `lib/payments/paymentProcessing.ts` | 31분 결제, 늦게 도착한 legacy claim, 실제 만료, 변조·재사용, 다른 결제 이메일, 검토 주문/다른 소유자/미확인 이메일 접근 차단 | 24시간 뒤 실제로 생성된 주문이나 원래 claim 증거가 없는 주문은 지원 검토 필요. 과거 잘못된 계정 연결을 자동 수정하지 않음. |
| F02 웹훅 상태 역전 | 원자적 SQL upsert에서 환불·부분환불·paid 상태의 잘못된 역행 차단. 기존 owner 보존, variant 충돌 차단. 무시된 이벤트의 0원 금액 덮어쓰기 방지. | `supabase/migrations/202610130001_payment_event_recovery.sql`, `lib/payments/paymentRepository.ts` | 실제 로컬 PostgreSQL에서 중복 주문, 환불→paid, partial→paid, 동일/과거 시각 실패 이벤트, owner/variant 충돌·금액 보존 | 실제 Supabase의 기존 schema/trigger와 다중 인스턴스 동시성은 staging 검증 필요. |
| F03 미등록 variant 유실 | 유효한 Live/store 웹훅은 먼저 영속 기록. 미등록 variant는 격리하며 상품 권한 지급 금지. 매핑을 검토한 뒤 같은 이벤트 재처리 가능. | `app/api/webhooks/lemon-squeezy/route.ts`, `lib/payments/paymentProcessing.ts`, migration 001 | 미등록 주문 durable capture, 권한 미지급, 매핑 복구 후 재처리. 기존 11개 상품과 두 번들 catalog 회귀 | 격리 건 모니터링 담당자 필요. 새 상품의 매핑은 자동 추정하지 않음. |
| F04 장애 복구 | 처리 상태·사유·시도 횟수·2분 lease 수신함 추가. HTTP/CLI가 같은 처리기를 사용. status/reconcile/replay, 기본 조회·dry-run, 명시적 ID+`--apply`만 쓰기. | `lib/payments/paymentProcessing.ts`, `paymentRepository.ts`, `scripts/payment-recovery.mjs`, webhook route | DB capture 실패 시 non-2xx, 저장 실패 후 재시도, 동시 중복, 중단 lease 회수, 환불 API 실패 후 재시도, dry-run 무변경, 잘못된 store/mode·증거 충돌 차단 | 아직 운영 스케줄/알림에 연결하지 않음. 누락 webhook 자체가 없는 주문은 공급자 주문 ID를 알아야 대조 가능. 실제 API 제한·권한 미검증. |
| F05 라이선스 표시 장애 | 필수 주문·소유권 검증 유지. 부가 상품명/기기 조회 실패만 분리해 키를 유지하고 기기 오류·재시도 표시. | `lib/payments/lemonEntitlements.server.ts`, `purchases.ts`, `app/mypage/page.tsx` | 실제 route 및 MyPage fixture로 부분 API 장애, 정상 키 유지, 기기 retry, 외부 계정·환불·Test Mode·다른 키/기기 접근 차단 | 필수 주문/키 API 자체가 실패하면 계속 fail-closed. 실제 번들 파일·라이선스 연결은 대시보드 검증 필요. |
| F06 GA4 구매 누락/중복 | 체크아웃 전에 intent 저장. 새 claim의 서버 영속 pending/채널 ACK, 60초 lease. 확인된 본인 Live paid 주문 ID만 사용. 일반 재방문·지연 웹훅·저장소 차단 복구, queue 즉시 sent 처리 제거. 취소 성공 오인 방지. | `lib/analytics/purchaseRecovery*.ts`, `ecommerce.ts`, `app/api/checkout/conversions/route.ts`, `lib/checkout/lemonOverlay.ts`, checkout 컴포넌트, MyPage, migration 002 | 실주문 조건·다른 계정·미확정 주문 차단, 중복 lease, 정확한 ACK token, callback 없는 재시도, preview 미전송, 지연 webhook, 취소/무관 주문, 저장소 장애 | callback≠Google 수신 증명. 미복귀·차단·72시간 초과는 미해결 범위. 재방문 시 광고 세션/집계 시각이 달라질 수 있음. Google 대시보드 수신·중복 설정 미검증. |
| F07 브라우저 저장소 오류 | localStorage 속성 접근/get/set/remove 예외 처리, 계정별 탭 메모리 fallback, 실패한 쓰기·삭제 뒤 옛 cart 부활 방지. cart 정리 예외와 구매 표시 분리. | `lib/cart/store.ts`, `app/mypage/page.tsx` | getter/read/write/remove 장애, 계정 분리, stale 저장값 복귀 차단, 정상 타 탭 저장 반영, 구매·라이선스 표시 유지 | 저장소 차단 상태에서 새로고침/탭 종료 뒤 cart 영속성은 보장되지 않음. |

## 보존한 구조

- raw body 기반 HMAC 서명 및 이벤트명 일치 검사.
- 같은 store, Live Mode, 공식 11개 variant 검증. 카탈로그/가격/checkout URL/번들 구성 파일은 수정하지 않음.
- 주문 ID 유일성, 서버에서 확인하는 사용자·주문·라이선스·기기 소유권.
- 공급자 API로 현재 환불 상태를 재확인하고, 완전 환불 기록 후 키를 비활성화하는 기존 순서. 부분 환불 권한 유지.
- RLS와 서버 전용 키, 고객 응답 `private, no-store`.

## 검증 방법

최종 로컬 결과: **자동 테스트 114개 전부 통과**, 타입 검사·정식 lint·프로덕션 빌드 통과, `git diff --check` 통과. 실패·skip 테스트는 없다. 변경 후 마지막 빌드도 합성 환경변수로 다시 실행했다.

`npm test`는 기존·신규 회귀 테스트 전체를 실행한다. HTTP와 MyPage source 테스트는 실제 모듈을 로드하되 인증/네트워크/브라우저를 합성 fixture로 대체한다. SQL 테스트는 PGlite PostgreSQL 18.6에서 전체 migration을 적용하고 원자적 상태 규칙·기존 데이터 보존·역할 권한·lease를 실행한다. 운영 URL이나 자격증명을 쓰지 않는다.

타입 검사는 `npx tsc --noEmit --incremental false`, lint는 `npm run lint`, 빌드는 `npm run build`로 수행한다. 빌드에는 합성 Supabase URL/anon key를 지정하고 서버 결제·DB 자격증명을 비워 두었다. 기존 이미지 최적화, Next lint 폐기 예정 및 상위 폴더 lockfile 경고는 이번 범위에서 변경하지 않는다.

## 배포 전 필수 사항

1. 사용자 배포 승인 후 별도 staging에서 migration/권한을 확인한다.
2. **001 결제 복구 migration → 002 분석 복구 migration → 앱 배포** 순서를 지킨다. 앱을 먼저 배포하지 않는다.
3. 서버 Supabase 키, Lemon webhook secret/API key/store ID, webhook 구독 및 체크아웃 복귀 URL을 확인한다.
4. `payments:recovery -- status --check` 조회를 운영 담당자/알림 체계에 연결한다. 자동 재처리는 구성하지 않았다.
5. 별도 승인된 실제 결제로 서로 다른 로그인/청구 이메일, 모바일·데스크톱, 11개 상품·번들, 다운로드·라이선스, GA4/Ads 수신을 확인한다. 로컬 테스트가 이 검증을 대체하지 않는다.

명령별 권한·영향, 수동 검토 사유, 롤백 주의사항, GA4의 남는 한계는 [결제 운영 절차](./payment-operations.md)에 정리했다.
