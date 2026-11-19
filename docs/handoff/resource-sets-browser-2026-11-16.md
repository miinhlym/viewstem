# 리소스 셋과 브라우저 렌더링 구현 인계

[확정 설계](../spec/12-resource-sets-browser.md) · [결정 이력 및 출처](../history/resource-sets-browser-2026-11-16.md) · [상세 구현 계획](../designs/viewstem-resource-sets-implementation-2026-11-16.md)

## 구현과 검증

`defineResourceSet()`과 `registerResourceSet()`은 의존 셋, 선언형 정의와 코드 바인딩을 Registry 후보에 함께 올린다. 열린 View에는 `applyResourceSets()`로 새 셋만 추가하고, 교체된 정의나 구현은 `replace()`로 새 내부 수명에 적용한다. View 준비 중 마지막 호스트 콜백 뒤 취소·Registry 리비전·URL 키 소유권을 재확인한다. State 통지 전에 Registry와 View를 함께 확정한다. [Core 공개 타입](../../packages/core/src/index.d.ts) · [등록과 적용 구현](../../packages/core/src/runtime.mjs)

공식 DOM과 Svelte 연결자는 `@viewstem/dom`의 공통 기반을 사용한다. UI 카탈로그는 `ui` 셋을 제공한다. 표시 연결이 성립하면 `mount().ready`가 View를 반환하고 연결별 `whenRendered()`가 실제 렌더 결과를 보고한다. [DOM 사용법](../../packages/dom/README.ko.md) · [Svelte 사용법](../../packages/svelte/README.ko.md) · [UI 사용법](../../packages/ui/README.ko.md)

| 검증 | 실행 위치 |
|---|---|
| 원자 등록, URL 예약 충돌, 리비전 재시도 중 취소, 진행 Query·Action 유지 | `npm run check`, `npm run test:package` |
| 슬롯 교체·keyed 이동, 렌더 실패 격리, 직접 호스팅한 Svelte의 부모 context와 표시 수명, UI 카탈로그 | `npm run check:dom`, `npm run check:svelte`, `npm run check:ui`, `npm run test:browser` |
| 제거된 Svelte 화면의 자동 정리 진단, 다른 셋 조상 아래의 중첩 CSS 적용 | `npm run check:svelte`, `npm run check:dom` |
| 문서 앱 소비 경로 | `npm run typecheck:docs`, `npm run build:docs` |
| 임시 디렉터리의 독립 소비자 세 구성 | `npm run test:dom:package`. Core 단독 Node 실행, Svelte 없는 DOM 단독, 외부 연결자와 공식 두 연결자의 혼합을 tarball로 검증한다. |

초기 구현 검증에서는 로컬 Node 22.23.4와 24.19.0에서 Core 테스트 1,158개와 Core·Svelte·DOM 패키지 소비 검증을 통과했다. 브라우저 검증은 Chromium에서 실행했다. npm 공개 발행 절차는 별도 작업이다.

## 이관 기준점

이관 시작 시 워크트리는 detached HEAD `f367ad42a5b80e56c4168f38bd53a5c73733a7ea`였고 변경 사항은 없었다. 이 커밋은 PR #3의 squash 결과이며 로컬 `main`과 `origin/main`이 가리키는 커밋과 같았다. 당시 매니페스트는 `core`, `svelte`, `ui`를 제공했다.

이전 `codex/viewstem-host-api` 워크트리에서 관측한 `409dd6f426065d453c338179a3abaa3383deda1f`, 그 뒤 `215cf0d512249077773b1656bf3a1a23c1f6f501`, 이후 로컬 HEAD `035bfba`는 당시의 비교 기준이다. 이전 워크트리 경로는 이관 시점에 존재하지 않았으나 세 커밋 객체를 로컬 Git에서 확인했다. `035bfba`와 현재 HEAD 사이에 파일 트리 차이가 없었다. `409dd6f`와 현재 HEAD 사이의 변경은 core 코드와 테스트에 있었다. 아래 상태는 이전 리뷰의 관측을 인용하는 데 그치지 않고 현재 체크아웃의 관련 경로를 읽어 대조한 결과다.

PR #3의 범위는 공통 `createRenderer`, `mount`·`attach`, `ready`·`whenRendered`·`whenSettled`, `unmount`·`detach`·`dispose`, View 입력·정의 갱신과 `replace`, 준비 취소, URL 동기화와 소유권, diagnostics, core와 렌더러의 공통 수명 호스트, `ui` 내부 DOM 구현, Svelte `ViewstemView`의 `source`·부모 context, 회귀 및 성능 수정이다. [호스트 API 구현 계획](../designs/viewstem-host-api-implementation-2026-11-13.md)

| 기준 커밋의 코드 경로 | 이관 당시 관찰과 분리 시 보존할 의미 |
|---|---|
| [core `renderer.d.ts`](../../packages/core/src/renderer.d.ts) | `connect(view, target, …)`가 View 전체 연결을 만들고 `dispose`·`whenRendered`를 반환한다. 공통 수명, 완료, 정리와 진단을 재사용할 기반이다. 노드와 slot을 조정할 엔진은 이 API에 없다. |
| [core `registry.mjs`](../../packages/core/src/registry.mjs) | `(kind, id)` 기준으로 정의를 보유한다. 호출별 후보를 검증한 뒤 게시하며 코드 Action 구현은 core에 저장한다. 별도로 소유하는 Svelte 어댑터와 의존 셋 그래프를 묶어 한 번에 게시하는 경로는 확인되지 않았다. |
| Svelte `types.ts` · `RenderNode.svelte` · `NodeList.svelte` | `ComponentAdapter`는 Svelte Component이며 `renderSlot`은 이름을 받는 Svelte `Snippet`이다. slot 재귀와 keyed each의 `nodeKey`로 Svelte가 트리의 인스턴스와 재정렬을 소유했다. |
| Svelte `connection.ts` | 주소와 generation을 키로 삼고 core projection을 구독했다. View 수명에 맞춰 어댑터 맵을 복사하고, 이벤트를 보내기 전에 현재 노드와 입력 준비를 확인했다. `whenRendered()`는 Svelte `tick`과 렌더 오류를 관찰했다. |
| [Svelte `renderer.ts`](../../packages/svelte/src/lib/renderer.ts), [`ViewstemView`](../spec/07-host-integration.md#jsts-호스트-api--d150) | `createRendererHost`가 `ConnectedView` 전체를 mount하고 `context`를 전달하며 unmount로 정리한다. 새 런타임의 정의와 어댑터 쌍, 주입된 런타임에서의 `bindComponent`, 선언형 `ViewstemView`의 소유·대여와 부모 context는 호환성 기준이다. |
| UI `dom.ts` | shadcn DOM·behavior·입력 처리와 자체 keyed reconciliation을 수행했다. 단일 기본 child host를 쓰며 재정렬 시 focus·입력 selection을 보존했다. generation 변경 등의 조건에서 인스턴스를 교체하고 이벤트·behavior를 정리했다. 일부 컴포넌트는 조상·직접 자식·태그·data 속성에 의존했다. |
| [UI `index.ts`](../../packages/ui/src/index.ts) | 생성하는 Runtime에 `shadcnContracts`를 넣고, 호스트의 연결을 `dom.connect`에 고정한다. 주입 Runtime에 `registerShadcn`으로 계약을 넣는 경로도 제공한다. 새 설계의 범용 DOM 연결자나 리소스 셋 등록 API는 확인되지 않았다. |

<a id="미결-사항"></a>

## 이관 당시의 미결 사항

| 범위 | 구현 설계와 검증에서 구체화할 점 |
|---|---|
| 공개 모델과 모듈 | 함수명·타입·schema와 파일 배치, 패키지 의존성·export·import, 공개 연결자 입력·이벤트·slot·mount/update/dispose 및 완료 계약. headless entrypoint를 소비할 때의 실제 의존성도 확인한다. |
| 셋 ID와 binding | 동일 셋 판정과 버전 호환 해석, 의존 순환 검출·진단, 계약 및 구현 binding의 식별 표현, 충돌 진단. 구현 정보의 보유 위치를 core의 프레임워크 비의존 경계에 맞춘다. |
| 등록과 적용의 내부 경계 | 동시·재진입 상황에서 최신 저장소 기준 검증과 원자 게시를 구현할 방법 및 registry 내부 구조. View별 snapshot/version/buffer 방식, 명시적 교체와 설정·정의 일괄 적용의 API. 렌더 실패의 원인 위치를 찾고 해당 부분을 정리·복구하는 구체 방식. |
| 호스트 기능 | capability의 공개 표기와 서비스 주입 경로, 누락 오류의 구체 형식. |
| 새 패키지로 이행 | 기존 소비자가 없다는 전제에서 저장소의 예제와 테스트를 새 패키지 사용 경로로 이행한다. 현행 Runtime 소유·대여, `ViewstemView`의 부모 context, 렌더 완료, 오류와 정리는 동작을 비교할 기준으로 삼는다. |
| 슬롯 구현 | 두 일반 콘텐츠 사례의 소유권을 실제 DOM에서 확인한다. wrapper의 의미가 중요한 경우 anchor/range 등은 검토 후보이며, Menu·Trigger 등 복합 구조, native context·portal·SSR·hydration·transition의 지원 범위는 별도 판단한다. |

정확한 구현 단계와 알고리즘은 구현 계획에서 정한다. 기존 View 수명 관리를 재사용하면서 공통 브라우저 조정의 범위를 두 혼합 사례로 확인하는 것이 이관된 방향이다.

## 후속 수락 시나리오

아래 항목은 설계 검증 계획이다. 이관에서 패키지 설치, 테스트, 브라우저 실행, 벤치마크는 수행하지 않았다.

| 사례 | 관찰할 결과 |
|---|---|
| Svelte Layout → DOM Button | 하나의 core View에서 Button을 Svelte 부모의 slot에 정상 표시한다. 입력 갱신이 자식에 반영되고 Button 이벤트가 core Action을 거쳐 기대 State를 변경한다. 부모 재렌더가 자식 소유 영역을 덮어쓰지 않는다. |
| DOM Card → Svelte PlantMap 또는 Chart | Card 콘텐츠에 Svelte 자식을 붙인다. Card와 자식 양쪽 입력·이벤트가 같은 core View에서 갱신되고 DOM 구조가 유효하다. 부모와 공통 기반의 갱신이 Svelte 내부 DOM을 직접 수정하지 않는다. |
| 두 혼합 방향에서 같은 슬롯 내 keyed/repeat 재정렬 및 제거 | 같은 슬롯에서 동일 주소·generation을 유지하는 항목의 렌더 인스턴스가 유지되는지 확인한다. DOM과 컴포넌트 로컬 상태, 포커스를 관찰하고 해당 입력의 selection도 확인한다. 제거한 인스턴스의 cleanup은 정확히 한 번이고, 같은 키를 새 generation으로 만들면 새 인스턴스가 생긴다. 제거된 노드의 이벤트는 새 Action을 시작하지 않는다. 최초 mount·갱신의 렌더 완료 대기도 확인한다. |
| 이미 표시된 노드의 필수 입력 대기 | 같은 슬롯과 노드 수명에서 필수 입력을 준비→대기→준비로 바꾼다. DOM과 Svelte 양쪽에서 대기 상태를 표시하고, 대기 중 해당 노드의 이벤트는 새 Action을 시작하지 못한다. 입력이 다시 준비되면 기존 렌더 인스턴스와 로컬 상태를 유지한 채 새 입력을 반영한다. |
| 부모가 렌더를 끝냈으나 슬롯을 제공하지 않음 | 접힌 패널이 슬롯 없이 렌더를 마친다. 슬롯 자식의 마운트 횟수는 0회이고 표시 완료 대기는 패널과 나머지 노드의 결과로 성공한다. 부모가 슬롯을 제공한 뒤 자식을 마운트하며, 이미 완료한 대기의 결과는 유지한다. |
| 부모가 슬롯 DOM 교체 | 자식의 주소·generation을 유지한 상태로 부모 슬롯을 교체한다. 기존 자식 렌더 인스턴스의 cleanup과 새 슬롯의 mount가 각각 한 번이며, 자식의 기존 core State가 새 렌더 인스턴스에도 이어진다. |
| 늦게 도착한 컴포넌트 이벤트 | 렌더가 늦은 표시 연결에서 현재도 유효한 노드와 구현에 연결된 인스턴스가 보낸 이벤트로 Action을 실행한다. 슬롯 교체로 정리된 이전 인스턴스의 콜백, 닫힌 연결에서 온 이벤트, 현재 노드 수명이나 구현 연결이 달라진 이벤트는 새 Action을 시작하지 못한다. 슬롯 교체 사례에서는 Viewstem 노드 수명을 유지한다. |
| 의존 셋 등록 | 다이아몬드 의존과 같은 셋의 재등장에서 한 번만 등록되는지 확인한다. 같은 `(kind, id)`의 다른 정의, DOM Button 중복, 호환 불가 버전·내용 충돌과 순환의 진단을 확인한다. Query와 Component는 같은 문자열 ID를 사용할 수 있다. 순환의 처리 문제와 버전·내용 판정은 구현 계획에서 구체화한다. 의존성·정의·구현 준비 중 실패 시 기존 등록은 그대로이며 이번 추가분은 남지 않는다. |
| 코드형 컴포넌트 ID 하나의 구현 연결 | DOM 구현을 연결한 ID에 Svelte 구현을 일반 추가 등록하려 하면 이번 등록을 전체 거절하고 기존 DOM 구현을 유지한다. DOM과 Svelte를 각각 다른 ID로 등록하면 한 View에서 두 ID를 참조해 각 구현을 표시한다. |
| 셋 등록과 resolver가 같은 저장소에서 경합 | 두 후보가 동일한 `(kind, id)`에 다른 정의를 준비한다. 셋과 resolver가 각각 먼저 게시하는 순서를 모두 확인한다. 뒤의 후보는 최신 상태에서 충돌을 발견해 전체를 거절하고, 먼저 확정한 정의를 유지한다. 충돌하지 않는 두 후보가 겹쳐 진행되는 경우 둘의 변경이 모두 남는다. |
| Runtime의 기본 저장소와 명시적 공유 | 같은 프로세스에 별도로 만든 두 Runtime에서 같은 종류·ID의 서로 다른 정의를 각각 등록하고, 새 View가 자기 Runtime의 정의를 사용하는지 확인한다. 두 Runtime에 같은 저장소를 주입하면 한쪽의 등록을 다른 쪽에서 새로 만든 View도 사용할 수 있고, 충돌 판단은 같은 저장소를 기준으로 한다. |
| 실행 중 등록, A/B View, 새 View | 공유 저장소를 사용하는 A·B가 열린 상태에서 새 셋을 등록하고 둘의 설정이 그대로인지 확인한다. A에만 추가 적용했을 때 A의 View 수명, 편집 중인 폼의 View·컴포넌트 State, 기존 정의와 구현을 쓰는 폼 인스턴스가 유지된다. B는 예전 정의와 구현·Action 함수를 함께 유지한다. 새 View는 사용 가능한 구성을 기본 사용한다. View 정의가 실제로 참조하기 전에는 PlantMap이 생성되지 않는다. |
| Query와 Action 실행 중 셋 추가 적용 | 조회 Query와 저장 Action의 응답을 지연시킨 상태로 A에 셋을 추가 적용한다. 진행 중인 두 실행이 시작 당시 정의와 구현으로 이어지고, 조회와 저장 요청이 추가 적용으로 다시 전송되지 않는다. 적용 뒤 새로 시작한 독립 실행에서는 새로 추가된 리소스를 사용할 수 있다. |
| 기존 바인딩의 변경을 요구하는 추가 적용 | 적용 후보에서 기존 정의·구현 또는 코드 Action 함수 연결의 변경이 필요하면 준비 단계에서 거절한다. A의 기존 구성과 State·인스턴스가 유지되며, 이미 성공한 새 셋 등록과 B에 영향이 없다. |
| 저장소 교체와 열린 View의 명시 적용 | A·B가 열린 상태에서 리소스 교체를 게시한다. 새 View는 교체된 정의와 구현을 사용하고 A·B는 기존 구성을 사용한다. A에만 교체를 명시 적용하면 A의 View 내부 수명이 새로 시작되고 이전 수명의 인스턴스는 정리된다. 서비스 소유 State를 보존하며 B는 기존 구성을 사용한다. |
| 코드 Action 함수의 동일 ID 교체 | 기존 `save` 호출이 진행 중일 때 같은 입출력·필수 호스트 기능의 새 함수를 명시적으로 게시한다. 기존 호출과 명시 적용 전 View의 호출은 기존 함수를 쓰고, 새 View와 명시 적용한 View의 새 호출은 새 함수를 쓴다. 입력·출력 또는 필수 기능이 다른 후보는 동일 ID에서 거절하고 새 ID로 등록한다. |
| 리소스 설정과 View 정의의 일괄 적용 | PlantMap의 교체 구성과 새 필수 입력을 쓰는 View 정의를 한 요청으로 검증해 함께 확정한다. 같은 요청에서 입력 또는 바인딩 검증을 실패시키면 대상 View의 기존 설정과 정의를 모두 보존한다. |
| 준비 콜백의 Action과 기존 화면의 클릭 | 새 설정의 검증 콜백에서 기존 저장 Action 또는 후보에만 있는 Action을 직접 호출한다. 호출은 오류를 반환하고 본문·외부 요청은 0회다. 별도 경우에 적용 준비를 지연시킨 동안 기존 화면에서 정상 클릭을 발생시키면 확정된 구성의 Action을 실행한다. |
| 같은 View의 표시 연결 두 개 | View의 설정이 한 번 확정되고 두 연결이 같은 설정을 사용한다. 한쪽 렌더가 대기 중이어도 먼저 반영한 쪽의 완료를 관찰할 수 있다. 한쪽이 렌더에 실패하면 그 연결에서 실패를 관찰하며, 확정한 View 설정과 다른 연결의 렌더 진행은 유지된다. |
| 첫 렌더 대기와 실패에서 `mount().ready` | View 준비와 표시 연결을 완료한 뒤 PlantMap의 첫 렌더만 지연시킨다. `ready`가 View를 반환하는 동안 `whenRendered()`는 렌더 결과를 기다린다. PlantMap이 실패하면 `whenRendered()`에서 오류를 보고하고, 앱은 반환된 View로 정상 검색 폼을 제어할 수 있다. |
| 같은 View 적용에서 미완료 투영이 대체됨 | 같은 연결에서 첫 투영이 렌더 중일 때 최신 투영을 제공한다. 미완료 대기는 최신 투영의 성공 또는 실패를 보고한다. 대체된 첫 투영이 늦게 실패해도 결과에 영향을 주지 않는다. 첫 투영의 렌더 대기가 이미 끝난 경우 그 결과는 유지된다. 별도 View 적용 확정으로 이전 적용을 대체하면 이전 미완료 대기는 `CANCELLED`가 된다. |
| 현재 표시할 컴포넌트의 구현이 적용 후보에 없음 | A가 현재 표시할 PlantMap의 구현 바인딩이 빠진 View 설정 후보를 준비 단계에서 거절한다. A의 이전 설정을 보존하고 후보 설정을 게시하지 않는다. |
| 적용 후 처음 필요한 구현이 없거나 한 연결에서만 사용 불가 | 설정 확정 후 조건이 바뀌어 처음 표시하는 컴포넌트의 구현이 없으면 해당 표시 연결에서 실패를 관찰한다. 같은 View를 두 곳에 표시할 때 한쪽 연결에서만 렌더할 수 없는 경우에도 해당 연결에서 실패를 관찰한다. |
| 실패 단계와 완료 관찰 | A의 설정 준비 실패 시 A의 기존 설정, 이미 성공한 등록, B를 보존한다. 실제 렌더 실패는 연결의 진단과 완료 대기에서 확인하고 정의·등록 준비 실패와 구분한다. DOM·포커스·로컬 상태나 외부 효과의 완전 복구를 수락 조건으로 두지 않는다. |
| 표시 연결 안에서 컴포넌트 렌더 실패 | PlantMap의 마운트가 실패하고 실패 위치를 해당 컴포넌트로 특정한다. PlantMap과 해당 슬롯에 의존하는 자식에 영향이 한정되고, 같은 표시 연결의 독립적인 검색 폼은 렌더링되며 입력을 받는다. 해당 표시 연결의 렌더 완료 대기는 실패를 보고한다. |
| 신뢰한 코드의 등록과 JSON의 구현 참조 | 서비스가 가져와 등록한 셋과 연결자의 코드는 View JSON의 코드형 리소스 참조로 사용할 수 있다. 구현이 미등록인 컴포넌트를 참조하면 오류를 반환한다. 선언형 정의를 호스트 resolver로 찾는 기존 사례도 확인한다. |
| Action의 필수 호스트 기능 누락 | router 없이 이동 Action과 일반 Action이 든 셋을 등록한다. 일반 Action은 실행되고 이동 Action을 호출하면 본문 실행과 외부 효과 전에 기능 누락 오류가 반환된다. 서비스가 routing을 공급한 환경에서는 같은 이동 Action이 공급된 기능을 호출한다. |
| 기본 UI의 직접 등록과 의존 셋 등록 | DOM 연결자만 준비한 Runtime에서 기본 Button 참조는 미등록 오류를 낸다. `@viewstem/ui`를 직접 등록한 경우와 이를 의존하는 셋을 등록한 경우 모두 같은 Button을 쓸 수 있다. 두 경로에서 같은 UI 셋을 만나면 기존 등록을 재사용한다. |
| headless와 대표 소비 경로 | 서버의 core 소비자가 렌더러 없이 Action을 실행한다. 쓰지 않는 UI가 등록되어 있어도 실행할 수 있다. DOM 단독 소비와 `core + svelte + ui` 소비를 대표 구성에서 확인한다. 수명·오류·완료 의미는 새 호스트 사용 경로에서 확인한다. |
| 독립 소비자의 공개 확장 | 저장소 밖에서 배포 패키지의 공개 API만 사용하는 소비자가 직접 만든 셋과 연결자를 등록한다. 공식 연결자와 한 View에 섞어 렌더하고, 입력 갱신과 core 이벤트·State, 재정렬과 한 번의 정리를 확인한다. [소비자 검증 계획](../designs/viewstem-resource-sets-implementation-2026-11-16.md#6-독립-소비자-수락과-패키지-검증) |
