# 공개 API 정리 · U41

후속 U42: 권고 이름 전체를 적용했다. 이 문서의 이전 이름·제안·검증 수는 당시 기록이며, 현재 사용법과 새 검증은 [네이밍 적용 인계](public-api-naming-2026-11-02.md)를 따른다.

사용자의 공개 API 축소 검토와 후속 리팩토링 요청에 따라 앱 작성·호스트 연결에 필요한 API만 공개한다. 내부 구현 클래스·검증기·실행 엔진을 숨기고, 기존 단일 런타임에 위임하는 공개 핸들을 제공한다. 새 상태 엔진이나 자동 UI 등록은 추가하지 않는다. 정확한 실행 결과·환경·해시는 [검증 기록](public-api-verification-results.json)이 소유한다.

## 진입점과 변경 안내

| 진입점 | 실행 export |
|---|---|
| `@viewstem/core` | `createRegistry`, `createRuntime`, `createStateStore`, `mergeOwnedUrl`, `gridLayout` |
| `@viewstem/core/http` | `createHttpExecutor` |
| `@viewstem/core/cel` | `compileCel`, `evaluateCel`, `celLimits` |
| `@viewstem/core/cel-support.json` | 기존 CEL 지원 목록 JSON |
| `@viewstem/svelte` | `createRenderer`, `ViewstemView`, `transformError` |

공개 발행 전 `0.1.0`의 API 변경이다. 기존 import·생성자·내부 메서드 사용과 호환되지 않으며 자동 호환 별칭은 남기지 않는다. 실행 의미와 JSON 리소스 형식은 유지한다.

| 이전 사용 | 변경 후 |
|---|---|
| `new Registry/StateStore/Runtime(...)` | `createRegistry/createStateStore/createRuntime(...)` |
| `new View(...)` | `await runtime.mount(...)`가 반환하는 `view` |
| 루트 `createHttpExecutor`, `HttpExecutorOptions` | `@viewstem/core/http` |
| 루트 `compileCel`, `evaluateCel`, `celLimits`, `CelOptions`, `CelLimits` | `@viewstem/core/cel` |
| `createQueryEngine`, `QueryEngine`, `QueryUsage` | `ViewSpec.queries`와 `view.getQuery()`; 명시 Query 실행은 Action의 Query 단계 |
| `evaluate`, `evaluateSnapshot`, `EvaluationContext`, `EvaluationOptions` | 리소스의 값 표현식 `@path`/`@call` |
| `runtime.variable()` | Variable 리소스를 Derived 또는 Action의 Variable 단계에서 사용 |
| `compileSchema`, `SchemaValidator`, `equal`, `normalizeDate`, `localInstant`, `encodeBoundary`, `joinRows`, HTTP `joinAddress` | 내부 구현으로 전환. 등록·입출력·State·Query의 검증/변환 경로가 담당 |
| Scope의 `derived`, `dependencies`, `pendingInitial` 옵션 | 공개 Scope는 `schema`·`initial`만 수용. Derived·동적 초기값은 View/Component 선언 |
| Store 초기화·계산·contract 조회, batch의 내부 origin | 비공개. 공개 State 핸들·transaction·batch를 사용 |

`Registry`, `StateStore`, `Runtime`, `View`는 `import type`으로 유지한다. 사용자 작성에 필요한 리소스·포트·snapshot·호스트 callback 타입도 유지하며, 제네릭 추론 보조 타입은 직접 export하지 않는다. Svelte는 공통 타입을 명시 목록으로 재노출하므로 계속 한 패키지에서 시작할 수 있다. 선택 실행기 설정과 내부 엔진 타입을 Svelte로 전파하지 않는다.

## 실제 객체의 경계

공개 Registry·Store·Scope·Runtime·View는 내부 상태를 포함하지 않는 동결된 핸들이다. 내부 엔진은 private WeakMap으로 연결하며 메서드 체이닝·mount 결과·권한 콜백으로도 원시 실행 객체를 반환하지 않는다. 생성자와 deep import는 패키지 exports에서 제공하지 않는다. 이는 API 캡슐화이며 신뢰된 호스트 코드의 보안 sandbox가 아니다.

`runtime.registry`와 `runtime.stateStore`는 생성 시 주입한 공개 객체와 동일하다. 복사·모사한 객체는 허용하지 않는다. 외부 Store의 수명은 호스트가 소유하고, Runtime 폐기는 자신의 View와 진행 중 실행을 종료한다. State/Query capability, 코드 Action의 부모 취소·재귀 검사와 외부 독립 실행은 기존 계약을 유지한다.

`authorize`의 `update` owner는 해당 공개 View다. `invoke` owner는 수명별 동일성을 비교하는 불투명 객체이고 실행 메서드를 제공하지 않는다. 코드 Action의 `definition.native` 구현 함수는 권한 콜백에 노출하지 않는다. 리소스 목록·설명·정의 추출과 코드 여부 확인은 공개 Registry에 유지한다.

## 공개 경로 검사에서 발견한 재평가 수정

Clock 인수 테스트를 내부 Derived 생성 API에서 실제 Runtime·View로 옮기자 무관한 State 쓰기에도 `makeOwner`가 계산을 다시 설치하는 문제가 드러났다. 기대 평가 횟수를 완화하지 않고, 명시 State/port 연결·정의·입력이 같으면 계산 재실행만 생략하도록 수정했다. 계산 콜백은 현재 owner에 다시 연결하며 정의·입력 교체, Query port 갱신, 조건부 제거, 실패한 update의 callback/의존성 롤백을 회귀 검사한다. 추적하지 않는 문맥 경로는 기존 보수적 재평가를 유지한다. 입력 변화에 따른 결과·오류·취소 의미와 하나의 StateStore는 유지한다.

## 검증과 증거 보존

- 공개 API 전용 테스트는 정확한 export 목록, deep import 거절, 실제 객체 메서드, 동결·동일성·체이닝, 위조 핸들, 내부 초기화 옵션, 권한 콜백, 공유 Store와 취소를 검사한다.
- 같은 경계 테스트와 strict TypeScript의 positive/negative fixture를 독립 tarball 설치에서도 실행한다. 로컬 src alias로 우회하지 않는다.
- 기존 State·Action 인수 테스트의 내부 직접 호출을 가능한 곳에서 실제 Runtime·View 흐름으로 전환했다. 내부 비동기 초기화 등 구현 단위 검사는 내부 모듈을 명시 import하고 공개 API 테스트와 구분한다.
- core 인수 대응표, Node 22/24, CEL/core Chromium, 바닐라 playground, Svelte Chromium·타입·설치 소비자를 재검증한다. 정확한 통과 결과는 검증 JSON에만 기록한다.
- 이전 core/Svelte 검증 JSON과 실험 자료는 보존한다. 리팩토링 전 결과·선언·첫 실패 로그는 로컬 `packages/core/test/results/before-api-refactor/`에도 보존하며 Git 배포 자료로 간주하지 않는다.

독립 CEL 진입점 추가로 기본 진입점·타입·지원 자료는 11개이며 빌드는 공통 모듈 chunk와 source map도 함께 배포한다. root/CEL을 별도로 번들링했을 때 보호된 Set 원소의 참조 동일성이 깨진 실패를 보존하고, ESM 공유 chunk로 값 보호 WeakMap을 통합했다. Node/Chromium과 설치 tarball에서 같은 stored-object/새 equal-object 구별을 검증한다. Query 핸들의 미선언 내부 identity 속성도 제거하고 snapshot/refresh/retry만 노출한다. subpath 분리는 import 역할의 구분이며 core Runtime 자체도 CEL·기본 HTTP를 사용하므로 이 변경을 번들 크기 감소 보장으로 해석하지 않는다. Svelte 클라이언트·기존 Chromium 검증 범위를 유지하며 SSR, Dart/Flutter, UI kit, 선택 차트, npm 공개 발행은 포함하지 않는다.
