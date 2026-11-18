# Viewstem 리소스 셋과 혼합 렌더링 · EGM 9단계 재리뷰

**판정은 구현 준비도 미통과다.** 우선 해결할 항목은 코드 Action 교체 계약의 충돌, 후보 준비와 게시의 경계, 투영별 표시 완료, 단계별 테스트와 소비부의 이행이다. 이전 구조 검토의 F1–F8은 새 계획에서 추적할 수 있다. 이번 검토에서 드러난 차이는 아래에 묶었다. [검토 대상 계획](../viewstem-resource-sets-implementation-2026-11-16.md) · [이전 EGM 통합 리뷰](../viewstem-resource-sets-review-2026-11-16/consolidated_review_report.md) · [확정 명세](../../spec/12-resource-sets-browser.md)

## Blocker

### 1. 같은 ID의 코드 Action 함수 교체가 기존 확정 계약과 충돌한다

계획 40행은 호출 계약이 달라질 때 새 ID를 요구하고, 68행은 같은 정의의 함수만 교체할 수 있다고 전제한다. D154를 명문화한 Action 명세 201행은 기존 ID를 직접 호출하는 코드 Action의 구현을 교체할 때도 새 ID로 등록하라고 한다. 예를 들어 `save`의 포트와 출력은 그대로 두고 함수만 바꾸는 요청은 두 문서의 규칙에 따라 성공과 거절로 갈린다. [계획](../viewstem-resource-sets-implementation-2026-11-16.md#1-core-리소스-셋과-저장소-게시) · [코드 Action 등록과 갱신](../../spec/04-action.md#코드-action-등록과-갱신)

**권고.** 계획에서 D154를 유지한다. 코드 Action 함수 변경은 새 ID로 등록하고, 명시적 교체 API의 동일 ID 허용 범위와 테스트에서 이를 분명히 한다. 새 ID 등록 뒤 새 View 또는 명시적으로 적용한 View가 새 함수를 쓰고 기존 View와 진행 중 호출은 기존 함수를 쓰는지 확인한다. 동일 ID의 함수 교체를 제품에서 원하면 명세와 결정 이력의 변경이 필요하다.

### 2. 후보 준비·재시도·URL 예약을 잇는 커밋 순서가 부족하다

계획 58–60행은 확정 구성의 가시성과 실패 가능한 검증이 끝난 동기 게시 구간을 요구한다. 현행 `View.apply()`는 루트를 빌드하기 전에 `this.runtime`에 후보를 대입한다. `getSnapshot()`은 이전 투영을 반환하지만 공개 `invokeAction()`은 `owner.runtime.actions`에 접근한다. 실행 엔진의 기존 owner를 재사용하는 구현에서 이 대입을 그대로 두면 준비 콜백의 재진입 호출이 후보 구성을 읽을 수 있다. 현행 `urlConnection.commit()`도 `beforeCommit` 뒤에 키 충돌과 URL 소유권을 검사한다. 리비전 불일치 후 돌아갈 때는 `job.phase`가 `commit`인 상태에서 기존 취소 경로가 동작하지 않는다. [계획](../viewstem-resource-sets-implementation-2026-11-16.md#2-view-리소스-적용과-resolver-경합) · [View와 Runtime 실행 경로](../../../packages/core/src/runtime.mjs) · [URL 예약](../../../packages/core/src/url.mjs)

**권고.** 후보는 준비 함수에 명시적으로 전달하고 공개 View 호출은 확정 구성으로 해석하도록 계획에 적는다. 최종 준비, 취소와 리비전 검사, URL 소유권 검증 및 예약 게시의 순서를 지정한다. 충돌 검사와 실패 가능한 콜백은 첫 공개 변경 전에 끝난다. 리비전 재시도는 임시 State와 owner를 정리하고 동일 작업을 `prepare` 단계로 돌린 뒤 시작한다. 아래 세 사례에서 게시 상태와 외부 실행 횟수를 단언한다.

- 준비 콜백에서 후보에만 있는 Action을 호출해도 그 본문 실행은 0회다.
- 마지막 준비 콜백 중 다른 View가 같은 URL 키를 선점하면 기존 등록·View 설정·State가 유지된다.
- 재진입 등록으로 다시 준비하는 요청을 취소해도 준비 중인 후보는 게시되지 않는다. 취소 없이 충돌하지 않는 두 요청에서는 두 변경이 모두 반영된다.

### 3. 표시 완료 대기에 필요한 투영 번호가 연결자까지 전달되지 않는다

계획 80·84–85행은 적용과 투영에 렌더 결과를 귀속한다. 현행 `createRenderWaiter.wait(generation, sequence)`는 해당 core 투영을 기다린 뒤 인자 없는 `render()`를 호출하고, 연결 호스트 역시 인자 없는 `adapter.whenRendered()`를 부른다. 한 적용에서 투영 P1 마운트가 늦고 P2가 먼저 표시된 뒤 P1이 실패하면, 이 인터페이스로는 P2 대기 결과와 P1 오류를 구별할 수 없다. `whenSettled(application)`에는 대응 적용의 최초 Query 보고를 기다리는 기존 의미도 있다. [계획](../viewstem-resource-sets-implementation-2026-11-16.md#4-공통-브라우저-기반과-공개-연결-계약) · [기존 대기 함수](../../../packages/core/src/renderer.mjs) · [공개 Renderer 타입](../../../packages/core/src/renderer.d.ts) · [적용 완료 계약](../../spec/07-host-integration.md#최소-sdk와-적용-완료)

**권고.** 투영·구현 바인딩·적용과 투영 번호를 함께 전달하는 읽기 경로와, 해당 키까지 기다리는 표시 연결 인터페이스를 고정한다. 같은 적용 안에서 후속 투영으로 합쳐진 대기, 새 적용에 의해 취소된 대기, 성공 뒤 늦게 도착한 실패를 각각 정의한다. 최초 연결 성립과 렌더 완료를 구별하는 `mount().ready` 이행 테스트도 이 단계에 배정한다. 한 연결의 P1이 늦게 실패하거나 연결이 닫혀도 자신 또는 다른 연결의 P2 결과를 잘못 확정하지 않는지 확인한다.

### 4. 단계 1부터 공개 API 검사에 필요한 테스트 파일이 빠졌다

계획 118–120행은 각 단계의 Core 검사를 요구한다. `public-api.test.mjs` 21–24·42–51행은 root·renderer export와 Registry·Runtime·View 핸들의 키를 정확히 열거한다. `defineResourceSet` 또는 `registerResourceSet`을 추가하는 단계부터 단언 갱신이 필요하다. 이 테스트는 `npm run check`와 Core tarball 검사에서 모두 실행된다. 새 `ready` 동작에 맞춰 전환할 `renderer-diagnostics.test.mjs` 143행 부근의 기존 첫 렌더 실패 단언과, 바인딩 필수 적용 시 이행할 Core tarball 스모크도 빠졌다. [계획의 검증 게이트](../viewstem-resource-sets-implementation-2026-11-16.md#구현-순서와-검증-게이트) · [공개 표면 테스트](../../../packages/core/test/public-api.test.mjs) · [진단 테스트](../../../packages/core/test/renderer-diagnostics.test.mjs) · [Core tarball 검사](../../../packages/core/scripts/test-package.mjs)

**권고.** 단계별 파일 표에 공개 API 키·타입·진단에서 함께 바뀌는 테스트를 배정한다. 전환 단계에서 Core 단독 fixture에 프레임워크 독립 테스트 바인딩을 제공하고, 새 `ready` 계약을 확인하는 실패 사례를 추가한다. 각 체크포인트에서 추가한 API만 새 기대값에 반영한다.

### 5. 공식 연결자 전환의 소비부와 tarball 검사가 이행 목록에서 빠졌다

계획 101·112·121행의 주요 경로 외에도 `apps/docs/src/examples/preview.ts`와 `component-demo-ui-setup.ts`가 실행 예제와 복사 코드에 기존 UI API를 사용한다. 문서 앱이 `dom`을 직접 import하면 `apps/docs/package.json`에도 의존성이 필요하다. 기존 Svelte tarball 검사는 Core·Svelte만 패킹하고 예제에서 `bindComponent`와 기존 export 목록을 검사한다. UI 소비 테스트는 Core·UI만 설치하고 구 UI 렌더러를 import한다. 계획대로 패키지를 전환하면 이 검사들과 문서 빌드가 같은 단계에서 어긋난다. [계획의 전환 경로](../viewstem-resource-sets-implementation-2026-11-16.md#5-svelte-연결자와-기본-ui-셋으로-전환) · [실행 예제](../../../apps/docs/src/examples/preview.ts) · [복사 예제](../../../apps/docs/src/examples/component-demo-ui-setup.ts) · [docs 매니페스트](../../../apps/docs/package.json) · [Svelte tarball 검사](../../../packages/svelte/scripts/test-package.mjs) · [UI 소비 검사](../../../packages/ui/test/consumers.test.mjs)

**권고.** 첫 DOM 검증 단계에 워크스페이스 lockfile과 `check:dom`, 공식 연결자 전환 단계에 문서 앱·예제·브라우저 및 타입 fixture·기존 tarball 게이트를 배정한다. 정확한 생성·수정·삭제 경로를 단계별로 정하고, Core→DOM→UI/Svelte 의존 빌드와 tarball 로컬 설치 순서를 각 스크립트에 대응시킨다.

## Major

| 발견 | 보완할 내용 |
|---|---|
| 셋 엔트리와 소유 정보, 계획 33–40·56행 | 공개 입력 타입과 현재 등록 키 목록을 정한다. 셋 기록은 선언·의존 ID·소유 키를 보관하고, 적용 대상 엔트리는 각 키의 현재 값으로 읽는 안을 명시할 수 있다. 셋을 처음 등록할 때의 객체 동일성과 resolver가 받은 선언형 정의의 구조적 동등성은 별개다. 교체한 엔트리를 의존 셋으로 다시 만나는 경우, 미등록 셋 ID, 서로 다른 정의 형태 간 교체의 기대 결과를 적는다. 순환 테스트가 관찰할 수 있는 유효 입력 경계도 지정한다. [Registry](../../../packages/core/src/registry.mjs) · [resolver](../../../packages/core/src/runtime.mjs) |
| 실행 구성의 전달 경로, 계획 66–71행 | `ActionEngine` owner는 엔진별이며 Query 캐시는 엔진 클로저에 있다. 엔진과 owner·사용 수명을 유지한 채 호출별 구성을 넘기는 함수 경계를 명시한다. `QueryUsage.drain()`이 `running`을 통지하기 전에 `use`·입력·구성을 함께 캡처하도록 정한다. Action의 자손과 전달받은 Query 핸들이 어떤 구성을 쓰는지 구체화한다. 호스트 기능은 공개 `ActionContext`에 전달하는 데이터 형식, 누락 판정·오류 DTO와 Runtime별 종료 범위를 명시한다. [Action owner와 실행](../../../packages/core/src/action.mjs) · [QueryUsage](../../../packages/core/src/query/usage.mjs) · [공개 타입](../../../packages/core/src/index.d.ts) |
| 준비 중 바인딩 검사의 단계별 적용 범위, 계획 57·124행 | 생성·교체·추가·기존 View 연결별 검사 적용 표를 만든다. 전환 중에는 기존 연결자가 Registry 밖에 코드형 구현을 갖고 있다. 바인딩이 없는 Core View를 각 경로에서 사용할 때 준비 실패인지 연결별 렌더 실패인지 구분한다. 준비 검사에는 Core가 판정할 수 있는 `ready` 코드 Component 투영을 사용하고 실제 슬롯·연결자 가용성은 표시 연결에서 판정한다. [소유 View 준비](../../../packages/core/src/api.mjs) |
| 공개 연결자의 슬롯·비동기 정리, 계획 79–84행 | 각 메서드의 동기·비동기 타입, 호출·정리 순서, 취소 신호의 범위, `afterChildren`과 끝내 제공되지 않은 슬롯의 결과를 고정한다. 같은 이름의 새 슬롯을 등록한 뒤 이전 슬롯의 지연 철회가 도착해도 새 슬롯은 유지돼야 한다. 철회를 개별 등록 토큰에 묶고 지연 mount·갱신과 슬롯 교체를 겹쳐 검증한다. [현재 호스트 타입](../../../packages/core/src/renderer.d.ts) |
| 공통 재사용 규칙과 카탈로그 이행, 계획 81·91–98행 | 현행 Svelte는 동일 주소의 코드 노드가 `pending`이어도 인스턴스를 유지하고 DOM UI는 준비되지 않은 노드를 목록에서 뺀다. DOM UI는 같은 세대에서도 `Button.href`가 바뀌면 실제 태그를 교체한다. 새 연결자가 준비 상태와 내부 태그 변경을 어느 수명에서 다룰지 적는다. 기존 `ViewstemView`의 `fallback(node, error)`와 부모 context도 이행에서 관찰할 대상을 지정한다. [Svelte 렌더 경로](../../../packages/svelte/src/lib/RenderNode.svelte) · [UI 배치와 교체](../../../packages/ui/src/dom.ts) · [태그 결정](../../../packages/ui/src/markup-families.ts) |
| 독립 소비자의 수락 판정, 계획 107–112행 | 한 View에 외부 연결자와 공식 연결자를 넣는 확정 조건에 맞춰 정확한 fixture 트리를 적는다. DOM Card → Svelte Layout → 외부 keyed 노드는 세 연결자가 한 View에 들어가는 방안이다. headless는 셋 등록 후 일반 Action 실행으로, 외부 코드 Component 실행은 브라우저로 관찰한다. 독립 디렉터리의 tarball에서만 모듈이 해석되는지 확인하고, 기존 UI 테스트의 workspace `nodePaths`는 이 검증에 사용하지 않는다. Node·DOM-only·혼합 설치 목록과 CI 명령을 정한다. [독립 소비자 수락 기준](../../handoff/resource-sets-browser-2026-11-16.md#후속-수락-시나리오) · [기존 UI 소비 검사](../../../packages/ui/test/consumers.test.mjs) |

문구를 정리할 때 계획 33행의 정의·연결자 ID·구현 값은 세 필드가 있는 항목으로 표시하고, 112행의 발행 비교 기준은 이전 태그에서 푸시 이벤트의 `BEFORE_SHA`로 고친다. 첫 발행 분기는 로컬 tarball 검증과 구분한다. [발행 비교 코드](../../../.github/scripts/npm-release.mjs)

## 이전 리뷰와의 대응

| 이전 항목 | 이번 확인 |
|---|---|
| F1 · 열린 View와 표시 수명 | 추가·교체·진행 실행과 연결별 완료 규칙이 반영됐다. 준비 중 구성 가시성, 기존 실행 엔진과의 연결, 투영별 완료 전달을 구체화해야 한다. |
| F2 · 실패 단계 | 준비 실패와 연결 렌더 실패가 구분됐다. 전환 단계별 검사 진입점과 첫 렌더 실패 관찰을 고정해야 한다. |
| F3 · 저장소와 경합 | Runtime별 기본·명시적 공유, 최신 리비전 재검증이 반영됐다. URL 예약과 State/Registry/View 게시 순서의 구현 설명이 필요하다. |
| F4 · headless와 셋 합성 | 공통 셋과 UI 확장 의존의 구현 방향이 생겼다. 등록 키 소유 정보와 독립 설치 검증을 보완한다. |
| F5 · 슬롯 수명 | 동일 슬롯 이동, 슬롯 교체와 core State 보존이 반영됐다. 지연 철회와 기존 UI 내부 태그 교체를 공개 연결 경계와 맞춘다. |
| F6 · 실행 코드와 호스트 기능 | 신뢰된 코드 등록과 Action 직전 기능 확인이 반영됐다. 공개 Action 문맥과 주입 형식을 정한다. |
| F7 · 외부 연결자 | 독립 tarball 소비자 수락이 추가됐다. fixture 트리·설치 목록·해석 경로를 고정한다. |
| F8 · 등록 식별 | `(kind, id)`와 코드 Component ID당 구현 하나가 명시됐다. 코드 Action 구현 교체에서 D154와 충돌하는 문장을 정리한다. |

## 수행 기록

2026-11-16 작업 트리의 계획 SHA-256 `c3a34ab0888def62f736257fd44d322829d4fb7e168df40099d7595433d5f2b1`를 기준으로 검토했다. 기능 맥락은 1–24행, 상세 검토 범위는 25–141행이다. 5–8단계의 기존 F1–F8을 대조하고, 9단계에서 `egm-implementation-readiness`, `egm-codebase-details`, `egm-style` 세 명의 새 컨텍스트 리뷰 완료 결과를 종합했다. 주요 경로와 위험은 워크트리의 현재 코드로 확인했다. Svelte 공식 문서 링크의 재검증, 빌드·제품 테스트·브라우저 실행, 설계 원문과 소스 수정은 이번 검토 범위에 포함하지 않았다.
