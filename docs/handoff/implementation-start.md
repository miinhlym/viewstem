<a id="구현-인수인계-어디서-시작할-것인가"></a>

# core 작업 인수인계

이 문서는 기존 JS/TS core를 수정·검증할 때의 시작점이다. 구현 전 착수 계획은 뒤의 역사 기록으로 보존한다. 신규 기능 승인서나 공개 발행 기록은 아니다.

## 현재 구현 인계

[U37 구현 범위와 제한](core-implementation-2026-11-02.md), [제품 인수 대응표](core-acceptance-coverage.json), [실행 결과](core-verification-results.json)를 함께 확인한다. 독립 실험의 완료와 실제 패키지의 완료를 구분하며, 현재 결과를 과거의 ‘core 구현 보류’로 되돌리지 않는다.

## 새 채팅에서 시작할 때

1. `AGENTS.md` → [문서 지도](../README.md) → [전체 계약](../VIEWSTEM-SPEC.md)과 변경할 기능의 상세 명세를 읽는다. 작업 트리와 기존 변경부터 확인한다.
2. [패키지 사용법](../../packages/core/README.md), 공개 타입, 해당 제품 테스트에서 현재 구현을 확인한다. 최초 수직 시나리오나 CEL·패키지 구성을 다시 시작하지 않는다.
3. [인수 기대값](acceptance-matrix.md)과 [제품 테스트 연결](core-acceptance-coverage.json)에서 영향 항목을 찾는다. 실험의 기대값과 실패 archive는 보존하고 하나의 runtime·StateStore 경로를 수정한다.
4. 아래 검증 절차에 따라 변경 경계와 소비 흐름을 검사한다. 기존 결과는 소스·입력·환경이 같은 범위에서만 재사용한다.
5. [실제 남은 작업](open-contracts.md#실제-남은-작업)에서 후속 범위를 확인한다. 확정 계약의 버그·기술 세부는 자율 해결하고, 관찰 결과나 지원 범위가 달라지는 실제 제품 선택만 논의한다.

Q1–Q3과 U35는 종료된 결정이다. 코드 Action 문맥 `invokeAction`은 부모의 취소·재귀 검사를 상속하고 외부 runtime 호출은 독립 실행이라는 [현재 계약](../spec/04-action.md#재귀확장-실행의-경계)을 유지한다. 이전 채팅이나 비공개 `context-archive`는 작업의 필수 의존성이 아니다.

<a id="1-현재-상태"></a>

## 구현과 문서의 기준

실제 패키지의 초기 구현은 `adbad43`에 있으며 이후 검토 수정과 실행 범위는 [구현 인수인계](core-implementation-2026-11-02.md)에 기록한다. 이 문서의 예시나 과거 계획을 실행 완료 증거로 사용하지 않는다. 로컬 커밋·원격 반영·npm 발행은 각각 별개다.

현재 계약의 설명은 명세가, 정확한 JS/TS 시그니처는 [index.d.ts](../../packages/core/src/index.d.ts)와 [http.d.ts](../../packages/core/src/http.d.ts)가 소유한다. 세부 판단은 [위임 기준](open-contracts.md#세부-판단의-위임과-논의-기준)을 따른다.

## 수정 후 검증

저장소 루트의 [실제 명령](../../package.json)과 [CI 행렬](../../.github/workflows/core.yml)을 사용한다. 지원 환경과 마지막 실행 증거는 [검증 결과](core-verification-results.json)에서 확인한다.

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:browser
npm run test:package
```

- `check`는 build → 제품 실행 보고서 → strict 타입 → 인수 대조 순서다. 실행 보고서는 `packages/core/test/results/current.json`에 생성되며 skip/todo는 통과로 계산하지 않는다.
- 변경 경계의 빠른 검사는 해당 `*.test.mjs`를 `node --test`로 실행한다. [인수 대응표](core-acceptance-coverage.json)의 정확한 파일·이름과 [State/값/URL fixture 안내](../../packages/core/test/fixtures/state/README.md)를 사용한다.
- 인수 테스트 연결이 바뀌면 제품 매핑을 수정한 뒤 `node packages/core/scripts/build-coverage.mjs`로 대응표를 재생성하고 실행 보고서와 대조한다. 원래 [실험 목록](../../experiments/verification/coverage.json)은 덮어쓰지 않는다.
- CEL 패치·카탈로그 변경은 [지원 범위](core-cel-support.md)와 [고정 소스 재현 절차](../../packages/core/vendor/README.md)를 함께 검증한다.
- 브라우저 동작 변경은 `test:browser`, 공개 타입·배포 구성·패키지 README 변경은 `test:package`로 소비자를 확인한다. 문서 경로만 바뀌면 링크·앵커·배포 경계와 `git diff --check`를 확인하며 무관한 전체 제품 검사를 반복하지 않는다.
- `playground/` 변경은 `npm run test:playground`와 실제 화면 확인을 추가한다. 사용법·분할 화면·도구 범위는 [playground README](../../playground/README.md), 실행 증거는 [별도 결과](playground-verification-results.json)를 따른다.
- 결과 요약 JSON은 위 명령으로 자동 갱신되지 않는다. 새 실행 증거·해시를 반영하고, 재사용한 검사와 다시 실행한 검사를 구분한다. [날짜별 구현 보고](core-implementation-2026-11-02.md)는 그 시점의 기록으로 유지한다.

<a id="2-제품과-의존성-경계"></a>

## 제품과 의존성 경계

```text
언어 독립 계약·적합성 시나리오
  ├─ JS/TS core ── Svelte 렌더러 ── 서비스/선택 UI 모듈
  │             └─ 다른 JS 프레임워크 렌더러(후속)
  └─ Dart core + Flutter(후속; 같은 의미의 별도 구현)

회사 업무 확장 ──> 개인 Viewstem core
개인 core ──X──> 회사 도메인/업무 API/비밀정보 저장소
```

- 개인 모노레포에서 core와 Svelte 패키지를 분리한다. `@viewstem/core`, `@viewstem/svelte`는 명명 기준이지 npm scope 확보·배포 완료 사실이 아니다. 라이선스·배포 설정은 별도다. [E04, E41]
- core는 DOM·Svelte 없이 검증, 상태, 값 평가, 의존성, Query/Action 실행, 수명, 변경을 담당한다. Button·Grid·차트·Toast·업무 리소스를 자동 등록하지 않는다.
- 코드형 Component/Action은 서비스가 공개 계약과 구현을 명시 등록한다. 선택 UI 패키지로 일반 컴포넌트를 제공할 수 있다. 핵심 라이브러리에 구체 UI를 넣지 않는 것이 UI 지원 금지는 아니다.
- 회사 확장은 업무 리소스·업무 API·장비 로직을 소유한다. 회사 도메인 예제를 core의 필수 필드나 기본 데이터 모델로 승격하지 않는다.
- 서비스와 에이전트는 같은 탐색·설명·변경·호출 기반을 사용한다. 별도 에이전트 상태 엔진을 만들지 않는다. 에이전트 없이 화면은 완전히 동작해야 한다. [E03, E20]
- Flutter는 JS core의 렌더러만 바꾸는 문제로 약속하지 않는다. 언어 독립 계약에 맞는 Dart 실행기와 교차 적합성이 필요하다.

<a id="6-다음-담당자-운영-규칙"></a>

## 다음 담당자 운영 규칙

1. 현재 명세와 결정 등록부를 먼저 읽는다. 예전 Patchboard 명칭은 이관표를 통해 해석한다.
2. 예시에서 미결로 표시된 부분은 설계 결론으로 복사하지 않는다.
3. 구현 시나리오를 테스트 파일로 옮기고 결과·실행 환경을 별도로 기록한다.
4. 기존 결정을 바꾸면 새 결정·근거·대체 대상·영향 테스트를 남긴다.
5. 문서 전달은 구현 승인·커밋·push·발행을 자동 의미하지 않는다.

## U36까지의 착수 기록

이하 구현 순서·첫 시나리오·날짜별 공백은 **실제 core 구현 전의 계획과 독립 실험 기록**이다. 당시의 ‘현재’, ‘후속’, ‘미구현’은 오늘의 작업 지시가 아니다. 기존 링크를 위해 절 제목은 보존하며 현재 절차는 [문서 앞부분](#새-채팅에서-시작할-때)을 따른다.

승인 의미 복원은 [의미 검토](semantic-review-2026-10-29.md), E53–E69의 보존·예외·대체 관계는 [원문→계약 대응표](source-contract-matrix.md), 결정 배경은 [등록부](../history/decision-register.md)와 [근거 색인](../history/evidence-index.md)에 남아 있다. 복원과 새로운 명확화 U01을 구분하며 과거 결과·실패 증거는 유지한다.

### 3. 구현 순서 제안

다음은 확정 기능의 구현 순서 제안이다. 패키지명 외 디렉터리·SDK 시그니처·의존성을 새로 확정하지 않는다.

| 순서 | 결과물 | 완료 판단 |
|---|---|---|
| 1 계약 고정 | 7종 리소스, Port/State, 노드·단계 타입과 검증 | 올바른 예제와 잘못된 참조/타입/XOR 사례를 구분 |
| 2 값·상태 | @path/@call 경계, CEL 평가 연결, StateStore·Derived·수명 | 값 전달과 핸들 전달, 초기화/명시 쓰기/오류 전파 검증 |
| 3 Query | sources/transform, 요청 실행 주입 경계, 사용 인스턴스 조정 | 현재 입력 유효성, 오래된 결과 차단, refresh와 gate 검증 |
| 4 Action | 순차 단계·output·native 확장·호출 수명 | false/null/void·실패 중단·입력 스냅샷·늦은 반환 검증 |
| 5 화면 실행 | Component/View·slots·on·when/repeat·동일성 | 렌더러 없는 코어 수명과 작성자 문맥 검증 |
| 6 Svelte 연결 | 최소 등록 Component와 어댑터 | 실제 입력→Action→State→표시 수직 흐름 |
| 7 변경·에이전트 | 같은 코어 API의 탐색/호출/원자적 구성 변경 | A만 변경, 원본 자동 저장 없음, 실패 시 부분 적용 없음 |

서버 중계는 최초 core 테스트에서 주입 실행기로 격리할 수 있다. 다만 secret 경계를 빠뜨린 채 실제 HTTP 연결을 먼저 배포하지 않는다. 변화가 의미를 바꾸면 [결정 등록부](../history/decision-register.md)에 기록한다.

### 4. 현재 확정 계약과 착수 전 확인

U13에서 O01–O16을 모두 검토했다. [현재 처리 현황](open-contracts.md#o01o16-전체-처리-현황)과 canonical 상세를 사용하며, 이전의 포괄적인 “SDK·오류·타입은 미정” 목록으로 되돌리지 않는다. 사용자는 U15/U17/U18에서 **독립 실험을 승인**했고 [T1 결과](t1-experiment-2026-10-29.md), [T2 Query 경합 결과](t2-query-races-2026-10-29.md), [T2 URL 경합 결과](t2-url-races-2026-10-29.md)를 확보했다. 아래 문단은 각 실험을 수행한 당시의 범위 기록이다. U36 인계 당시 독립 실험의 최종 범위는 U34–U35 진행표를 따르며 과거 부분 검증·보류 상태를 현재 상태로 되돌리지 않는다. U20의 헤더 거절·Login/timeout/취소 증거는 유지한다. U21에서 API 응답 책임을 정정하고 U22에서 auth.token의 문맥 분리를 수정·검증했다. U23에서 오류 정제를 보완하고 Node/Chromium HTTP 대조를 통과했다. U24에서 CEL 배열 크기를 확인하고 배열 경로를 수정·검증했다. U25에서 params 객체를 병합 전에 검사하도록 수정·검증했다. U26에서 headers 전체 @path를 처리하고 금지 헤더 검사 유지까지 검증했다. U27에서 request.path를 평가하고 기존 주소·목적지 검사 유지까지 검증했다. U28에서 Datasource.baseUrl과 method·Login request 전체를 보완하고 [현재 HTTP/Login의 동적 값 17개 위치](t2-path-audit-2026-10-30.md)를 모두 점검했다. 당시 HTTP 261/261, 실제 전송 대조 174/174, 경로 점검 304/304를 각 Node 버전에서 통과했고 고의 결함 6종도 탐지했다. 미구현 core/핸들/반응형 문맥은 이 결과로 검증되지 않는다. U29에서는 같은 Query 스케줄러와 HTTP/Login 실행기를 연결해 [실제 HTTP 경합 39개와 고의 결함 4종](t2-query-http-2026-10-30.md)을 Node 22/24 각각 검증했다. 기존 두 실험 구현은 바꾸지 않았고 새로운 계약 충돌은 발견하지 않았다. U30에서 [복합 Query·완료 기준 polling](t2-composite-polling-2026-10-30.md)을 검증하고 재사용·오류 위치·owner cache 정리 누락을 수정했다. Node 22/24 각각 복합 48개·polling 34개와 실제 timer/HTTP 연결이 통과했으며 기존 스케줄러/HTTP 연결 회귀도 유지했다. U31에서 [재개 정책](t2-polling-resume-2026-10-30.md)을 즉시 fresh 갱신·active 뒤 한 건 결합·완료 후 interval로 확정하고, polling 54개·복합 51개와 기존 Query/HTTP 회귀를 Node 22/24에서 통과했다. 전체 등록/스키마·core/renderer 연결은 별도다. 확정 계약의 버그는 추가 승인 없이 고치고 검증하며 실제 선택이 필요한 사항만 논의한다.

- 확정된 기술 계약: 인라인 필드·포트 default·State 연결 검증, Query/Action 순환, Schema subset·동적 값·읽기 snapshot, HTTP 실행 계획·secret resolver, Query 상태/갱신/Join/Concat, 최소 SDK·공통 오류·Store/URL·반복 평가. 현재 명세와 D60–D67을 따른다.
- 확정된 제품 선택: U14/D68–D70에 따라 Q1은 마지막 성공 data·dataInputs 보존과 오류/이전 결과 표시, Q2는 날짜 문자열·명시 IANA 업무 시간대, Q3은 v1 선언형 Catch/Finally 제외와 코드 Action 복구다. 제시했던 세 선택 모두 사용자 승인으로 닫았다.
- 담당자 검증: T1 CEL/Schema·native/Dart, T2 HTTP/URL/갱신 경합, T3 SDK/renderer, T4 선택 차트. 실행기 패키지·비용 제한·실제 엔진 지원표는 실험 증거로 선택하며 작은 결정마다 사용자 재승인을 요구하지 않는다.

실제 구현 요청 후에는 현재 확정 계약에 맞춰 core 경로를 구현하고 T1–T4의 실험 기대값을 제품 코드 대상으로 재검증한다. Q1–Q3의 문서 확정만으로 해당 코드·codec의 완료를 주장하지 않는다. 명시 Action Query의 무캐시·기본 실패 중단·외부 효과 비롤백·현재 리소스 기반 실행·secret 비노출은 계속 유지한다.

### 5. 첫 수직 시나리오

도메인 중립 View에 문자열 State를 두고, 등록 TextInput이 `change` payload를 발행한다. `on`이 payload를 Action의 Value 포트에, State를 State 포트에 전달한다. SetState 후 같은 상태를 읽는 preview가 바뀐다. 이어 코드형 확인 Action이 boolean을 반환하고 `/actions/id` 및 후속 단계에서 실제 결과를 관찰한다.

이 경로가 검증되면 Query 목록 및 RefreshQuery, 반복 Component 상태 보존, 구성 일괄 변경을 연결한다. 외부 API 성공 뒤 후속 refresh 실패는 API 롤백으로 처리하지 않는다. 작은 경로의 성공을 모든 계약 구현 완료로 확대하지 않는다.

### U32/U33 후속 검증

[복합 Query·URL 교체·날짜 경계 기록](boundary-followup-2026-10-30.md)은 U32/U33 당시 증거다. 당시 확정 계약 위반을 수정했고, 새로 선택한 URL 정리 실패 정책은 새 화면 교체 완료·URL 동기화 오류 보고다. 복합 65개·URL 63개·직접 날짜 39개를 실제 실행했다. 기존 T1 후보 불일치는 유지되며 core 본 구현·CEL 패치·renderer 통합 완료로 확대하지 않는다.

### U34–U35 검증 완료 위치

[전체 진행표](verification-ledger.md)와 [224개 인수 항목 증거](../../experiments/verification/coverage.json)가 U36까지의 독립 실험 최종 상태다. T3의 State/Action/UI/application 모형·TypeScript 계약과 T4의 제한 차트 프로필도 실행했다. JS CEL 패치·native 값 어댑터와 Dart VM 값 교차 실험을 구별하며, 기존 Dart CEL 후보의 7개 불일치를 해결한 것으로 보고하지 않는다. 코드 Action 하위 호출은 U35에서 부모 취소·재귀를 상속하고 외부 호출은 독립 유지하기로 확정했으며, 문맥 호출·실제 Query ticket·UI 연결 수명 회귀를 실행했다. 이 문단은 U36까지의 실험 인계다. 현재 core 패키지 결과는 문서 맨 위의 U37 제품 인계를 따르며 Svelte renderer는 후속이다.
