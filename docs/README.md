# Viewstem 문서 지도

기존 공개 API 이름은 [U42 네이밍 적용](handoff/public-api-naming-2026-11-02.md)을 따르며, U44의 일괄 등록 API 추가는 [Svelte UI 인계](handoff/svelte-ui-shadcn-implementation-2026-11-03.md)를 따른다. [U42 검증 기록](handoff/public-api-naming-verification-results.json)과 이전 API 이름·해시는 당시 증거로 보존한다.

이 문서는 독자의 작업을 현재 기준 문서로 연결한다. 언어 독립 계약은 `VIEWSTEM-SPEC.md`와 `spec/`, JS/TS 사용법은 패키지 README, 실행 결과는 제품 검증 기록을 따른다. 이전 채팅이나 비공개 원문은 필수 읽기 자료가 아니다.

## 처음 참여했다면

| 하려는 일 | 시작점 |
|---|---|
| 패키지를 사용하거나 호스트에 연결하기 | [패키지 사용법](../packages/core/README.md), [호스트 연결 계약](spec/07-host-integration.md) |
| JSON을 편집하며 화면과 실행 상태 확인하기 | [core playground 사용법](../playground/README.md), [구현·검증 인계](handoff/playground-implementation-2026-11-02.md) |
| Svelte 앱에 렌더러 연결하기 | [Svelte 패키지 사용법](../packages/svelte/README.md), [실행 예제](../packages/svelte/example/README.md), [구현 인계](handoff/svelte-implementation-2026-11-02.md) |
| Svelte shadcn UI를 등록하고 전체 예제 실행 | [UI 사용법](../packages/svelte-ui/README.md), [U44 구현·검증 인계](handoff/svelte-ui-shadcn-implementation-2026-11-03.md), [66개 카탈로그·386개 부품 목록](handoff/shadcn-component-inventory.json) |
| 여러 컴포넌트를 결합한 화면 만들기 | [화면 예제 5개](../packages/svelte-ui/example/README.md), [예제 구현·검증](handoff/svelte-ui-examples-2026-11-03.md), [종류별 JSON 편집](handoff/svelte-ui-kind-editor-2026-11-03.md), [폼 State 구성](handoff/svelte-ui-form-state-2026-11-03.md) |
| 리소스와 실행 규칙 이해하기 | [전체 계약](VIEWSTEM-SPEC.md) → 아래 주제별 명세 |
| 기존 core를 수정하고 검증하기 | [현재 작업 시작 절차](handoff/implementation-start.md#새-채팅에서-시작할-때) |
| 지원 범위와 제한 확인하기 | [구현 인수인계](handoff/core-implementation-2026-11-02.md), [CEL 지원 범위](handoff/core-cel-support.md) |
| 다음 구현 범위 확인하기 | [실제 남은 작업](handoff/open-contracts.md#실제-남은-작업) |
| 과거 결정의 이유 찾기 | [결정 등록부](history/decision-register.md), [근거 색인](history/evidence-index.md) |

## 현재 인계 상태 · 2026-11-03

현재 구현 범위·제한·커밋과 발행의 구분은 [U37 구현 인수인계](handoff/core-implementation-2026-11-02.md)를 따른다. 실행 환경·통과 수·소스 및 산출물 해시는 [제품 검증 결과](handoff/core-verification-results.json)가 소유한다. 이 지도에는 변하는 검사 수를 복제하지 않는다. 날짜별 독립 실험의 ‘core 미구현’ 표기는 해당 시점의 기록이다.

공개 API의 현재 경계와 이전 사용법 변경은 [U41 API 정리](handoff/public-api-refactor-2026-11-02.md), 이 변경 이후 재실행 결과와 해시는 [API 검증 기록](handoff/public-api-verification-results.json)을 따른다. 이전 제품·Svelte 검증 JSON은 해당 시점의 증거로 보존한다.

후속 클라이언트 렌더러는 [U39–U40 Svelte 인계](handoff/svelte-implementation-2026-11-02.md)를 따른다. `@viewstem/svelte`만 import해 시작하며 core는 내부 의존성이다. 기본 UI는 자동 등록하지 않는다. UI 묶음은 [U44 Svelte UI 인계](handoff/svelte-ui-shadcn-implementation-2026-11-03.md)에 따라 별도 패키지에서 명시적으로 등록한다.

U44에서 변경한 Registry·Svelte 일괄 등록 및 폐기 후 emit 계약의 재검증, 현재 core·Svelte·playground 회귀 결과와 해시는 [U44 실행 기록](handoff/svelte-ui-shadcn-verification-results.json)에 있다. 이전 단계의 검증 파일을 덮어쓰지 않는다.

## 현재 명세

각 행은 해당 질문의 기준 문서다. 예제는 계약 이해를 돕고, 실행 결과를 대신하지 않는다. 실제 JS/TS 시그니처는 [공개 타입](../packages/core/src/index.d.ts)과 [HTTP 타입](../packages/core/src/http.d.ts), [CEL 타입](../packages/core/src/cel.d.ts)을 따른다.

| 질문 | 기준 문서 | 관련 구현·검증 경로 |
|---|---|---|
| 공통 리소스·참조·State·Port·소유권 | [전체 계약](VIEWSTEM-SPEC.md) | Registry·State·Port 제품 테스트 |
| HTTP 요청·인증·secret·목적지 권한 | [Datasource·인증](spec/01-datasource-auth.md) | HTTP 계약·경로·Query–HTTP 테스트 |
| Query 실행·변환·캐시·갱신 | [Query](spec/02-query.md) | Query 경합·복합·polling 테스트 |
| Variable·JSON Schema·typeRef | [Variable·Type](spec/03-variable-type.md) | 스키마 등록·실행 테스트 |
| Action 단계·결과·취소·하위 호출 | [Action](spec/04-action.md) | Action·수명 결합 테스트 |
| 화면·slots·이벤트·when/repeat·Grid | [Component·View](spec/05-component-view.md) | runtime·Grid·브라우저 테스트 |
| 리소스가 함께 실행되는 예 | [연결 예시](spec/06-composition-examples.md) | 위 계약을 설명하는 예시; 독립 기준 아님 |
| 호스트 SDK·권한·초기 완료 | [호스트 연결](spec/07-host-integration.md) | 공개 타입·runtime·독립 패키지 소비자 검사 |
| 적합성 검증을 구성하는 방법 | [적합성 안내](spec/08-readiness-conformance.md) | 아래 기대값·테스트 연결·실행 결과로 이동 |
| StateStore 관찰·reaction·URL | [Store·URL 현행 계약](spec/09-preserved-contracts.md) | State 통합·URL·실제 History 테스트 |
| missing·native 값·동등성·snapshot·날짜 | [값 계약](spec/10-value-contracts.md) | 값·스키마·날짜·CEL 테스트 |
| JS CEL에서 실행 가능한 기능·제한 | [CEL 지원 범위](handoff/core-cel-support.md) | [정확한 함수 목록](../packages/core/src/cel/supported-functions.json), CEL·브라우저 검사 |
| 선택 차트의 별도 제품 범위 | [선택 차트](spec/11-optional-charts.md) | 독립 실험 증거만 존재; 제품 잔여는 열린 과제에서 관리 |

명령과 실행 순서는 [수정·검증 절차](handoff/implementation-start.md#수정-후-검증)를 따른다. 인수 항목별 정확한 테스트 파일·이름은 아래 제품 대응표에서 찾는다. 보안 경계는 HTTP와 호스트 계약, 검증된 환경은 제품 검증 결과가 소유하며 운영 성능 보장으로 확대하지 않는다.

## 실행 검증의 현재 위치

| 확인할 사실 | 기준 기록 | 유지 방법 |
|---|---|---|
| 인수 ID별 기대 동작 | [인수 검증 행렬](handoff/acceptance-matrix.md) | 계약 변경 시 기대값·근거 갱신 |
| 기대값과 실제 제품 테스트의 연결 | [제품 인수 대응표](handoff/core-acceptance-coverage.json) | [build-coverage.mjs](../packages/core/scripts/build-coverage.mjs)가 원래 목록과 제품 테스트 매핑을 조합; 생성물을 별도 수기 목록으로 관리하지 않음 |
| 실제 실행 환경·결과·해시 | [제품 검증 결과](handoff/core-verification-results.json) | 실행 보고서와 검증 증거로 갱신; `test:report`가 이 요약 JSON까지 자동 갱신하지는 않음 |
| 바닐라 playground의 브라우저 흐름·화면 검증 | [playground 검증 결과](handoff/playground-verification-results.json), [기능별 점검표](handoff/playground-audit-2026-11-02.md) | `test:playground` 실행과 화면 확인 후 갱신; core 인수 항목과 별도 추적 |
| Svelte 렌더러·공개 타입·tarball 소비자 | [Svelte 검증 결과](handoff/svelte-verification-results.json), [구현 범위](handoff/svelte-implementation-2026-11-02.md) | `check:svelte`와 실제 예제 확인 후 갱신; core 인수 수와 별도 추적 |
| Svelte UI 카탈로그·동작·소스/CSS·번들 | [U44 실행 기록](handoff/svelte-ui-shadcn-verification-results.json), [지원 범위](../packages/svelte-ui/README.md) | `check:svelte-ui`; 전체 카탈로그와 JSON/native 전용 부품을 구분 |
| shadcn 66개별 입력·이벤트·State·중첩·키보드 | [동작 검증표](handoff/svelte-ui-audit-matrix.md), [감사 인계](handoff/svelte-ui-audit-2026-11-03.md), [실행 결과](handoff/svelte-ui-audit-verification-results.json) | 공개 패키지 브라우저 검사와 미실행 사례 검사; 기존 U44 mount/참조 수와 구분 |
| 구현 전 독립 실험의 이력 | [검증 진행표](handoff/verification-ledger.md), [원래 인수 목록](../experiments/verification/coverage.json) | 원래 실험·실패 증거 보존; 제품 통과 증거와 구분 |

## 배경과 이력

- [결정 등록부](history/decision-register.md): 채택·대체·기각·보류와 판단 근거.
- [Patchboard 이관표](history/patchboard-migration.md): 이전 요구의 보존 위치와 명시적 대체 관계.
- [근거 색인](history/evidence-index.md): 원본 E 계열과 프로젝트 결정 U 계열, 직접 원문과 회수 요약의 구분.
- [원문→계약 대응표](handoff/source-contract-matrix.md): 의미·이유·예외·인수 위치의 이관 추적.
- [의미 복원 검토](handoff/semantic-review-2026-10-29.md), [전체 리뷰](handoff/full-review-2026-10-29.md), [파일 이관 검증](handoff/transfer-verification.md): 날짜별 감사 기록. 현재 실행 상태를 소유하지 않음.

날짜별 T1–T4 실험과 후속 경계 기록은 [검증 진행표](handoff/verification-ledger.md)에서 찾는다. 해당 문서의 한계·실패·당시 미구현 표기를 현재 계약이나 제품 상태로 되돌리지 않는다.

## 상세 대화 기록

`context-archive/`는 Git 추적에서 제외한 로컬 원문이며 clone이나 패키지에 포함되지 않는다. 존재하는 환경에서만 [로컬 원문 안내](../context-archive/README.md)를 참고한다. 공개 가능한 현재 계약·결정 배경·구현 과제는 이 `docs/` 안에서 이해할 수 있어야 한다. 누락된 원문은 추정해 채우지 않는다.

## 문서 상태를 읽는 방법

- **현행 계약:** `VIEWSTEM-SPEC.md`, `spec/`의 확정 의미와 JS/TS 지원 문서. `09-preserved-contracts.md`는 이름에 이관 이력이 있어도 Store·URL의 현재 기준이다.
- **구현 제안:** 설명용 SDK·의사 코드. 실제 시그니처는 패키지의 타입 선언과 구분한다.
- **후속·미결:** [열린 과제](handoff/open-contracts.md)의 현재 잔여 목록. 종료된 Q1–Q3·U35는 선택 대기가 아니다.
- **과거 기록:** history·날짜별 실험·검토 보고서. 명시된 시점의 근거이며 현재 구현 완료를 취소하거나 새 지원을 승인하지 않는다.

## 이후 유지 방법

계약이 바뀌면 해당 기준 명세·결정 이력·인수 기대값을 함께 갱신한다. 실행 결과는 검증 기록에, 후속 작업은 열린 과제에 남긴다. 진입 문서에는 그 내용을 복제하지 않고 링크한다. 같은 경로의 이전 앵커와 실험 증거는 보존한다.

`docs/`와 실험 기록은 저장소 문서이며 비공개 내부 문서를 뜻하지 않는다. npm 패키지에 포함되는 문서는 [패키지 manifest](../packages/core/package.json)의 `files`에 따른 README·타입·CEL 지원 목록·라이선스 안내다. 상세 명세는 별도 저장소 문서다. 공개 발행 시 문서를 어떤 tag/commit과 연결할지는 [발행 후속 작업](handoff/open-contracts.md#실제-남은-작업)에서 관리한다.
