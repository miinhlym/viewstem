# Viewstem 공개 API EGM 리뷰

2026-11-16 작업 트리의 배포 선언과 빌드 산출물을 대상으로 검토했다. 기준 문서는 [호스트 연결 명세](../spec/07-host-integration.md)다. `core`, `dom`, `svelte`, `ui`의 설치, 첫 실행, 리소스 작성·등록·교체, 연결별 대기·정리, 외부 연결자 작성 경로를 확인했다. `core/http`, `core/cel`, UI의 CSS·카탈로그는 패키지 공개 경계와 해당 사용 경로를 확인했다.

**판정.** 명시적 셋 등록, `mount`와 `attach`의 소유권 구분, 연결마다 렌더를 기다리는 방식은 유지할 만하다. 소비자가 첫 화면에 도달하는 예제가 현재 패키지 구성과 어긋난다. Action을 파일로 분리하거나 외부 연결자의 정리 완료에 의존하는 정상적인 사용에서도 문제가 재현됐다. 첫 사용 예제와 실제 동작에 영향을 주는 공개 계약부터 수정하는 순서를 권한다.

## 우선순위가 높은 발견

### P0. 설치 문서와 루트 예제가 첫 화면을 막는다

루트 한·영 README는 `@viewstem/ui`에서 `createRenderer`를 가져온다. 이 가져오기는 빌드된 공개 ESM에서 `SyntaxError`가 난다. 한·영 설치 가이드는 UI 또는 Svelte tarball과 Core tarball만 설치한다. 두 패키지 모두 `@viewstem/dom`을 의존하므로 새 앱에서 문자 그대로 설치하면 npm이 `@viewstem/dom@0.1.0`을 찾다가 `E404`로 중단한다. DOM tarball을 추가한 대조군은 두 설치 모두 성공했다. [루트 README](../../README.ko.md#브라우저에-view-연결하기) · [설치 가이드](../../apps/docs/src/content/docs/ko/docs/installation/index.md) · [UI 공개 진입점](../../packages/ui/src/index.ts)

Svelte의 기존 앱 가이드는 `defineResourceSet`을 호출하면서 가져오지 않는다. 독립 소비자의 Chromium 실행에서 해당 예제는 `ReferenceError`가 났고, 가져오기 한 줄을 추가한 대조군에서는 화면이 렌더됐다. [Svelte 기존 앱 가이드](../../apps/docs/src/content/docs/docs/svelte/guides/mount-in-svelte.md#add-viewstem-to-an-existing-app)

설치·첫 화면 문서에서 Core 단독, DOM+UI, Svelte를 포함한 구성별 패킹·설치 명령을 같은 산출물에서 검증한다. 루트 예제는 `createRuntime()` → `registerResourceSet(ui)` → `createRenderer({ runtime })` → `mount()`로 바꾼다. 이미 검증된 세 구성의 tarball 테스트가 이 예제도 실행하게 하면 의존성 누락을 잡을 수 있다. [독립 패키지 소비 테스트](../../packages/dom/test/public-consumer.test.mjs)

공개 발행은 기존 계획에 별도 작업으로 남아 있다. 현재 발행 대상 함수에 네 패키지가 버전업된 상황을 입력해도 `core`, `svelte`, `ui`만 반환한다. 최초 `dom` 매니페스트가 비교 기준 커밋에 없을 때를 처리하고, 그 의존 패키지를 발행할 때 `dom`을 먼저 설치할 수 있게 해야 한다. [발행 대상 선택](../../.github/scripts/npm-release.mjs) · [발행 계획](viewstem-resource-sets-implementation-2026-11-16.md#6-독립-소비자-수락과-패키지-검증)

### P1. DOM fallback이 타입에 맞게 `void`를 반환하면 화면에 남을 수 있다

`BrowserDisplayOptions.fallback`은 `void` 반환을 허용하고 삽입 위치 `parent`, `anchor`를 제공한다. 이 위치에 로딩 요소를 넣고 반환을 생략하면 브라우저 기반이 정리 핸들을 저장하지 않는다. Chromium 재현에서 필수 입력을 추가하고 `whenSettled()`가 성공한 뒤에도 텍스트가 `loadingready`였다. 마운트 해제 후에는 둘 다 제거됐다. [fallback 타입](../../packages/dom/src/renderer.ts) · [fallback 수명 처리](../../packages/dom/src/connection.ts)

DOM을 생성하는 fallback은 `dispose()`가 포함된 핸들을 반환한다는 계약을 타입과 예제에 명시하는 것을 권한다. 반환 없이 DOM을 만들도록 지원하려면 브라우저 기반이 fallback 전용 DOM 범위를 소유하고 전환 시 비워야 한다. 핸들을 명시하면 이벤트·타이머처럼 DOM 외 자원도 정리할 수 있다.

```js
fallback({ parent, anchor }) {
  const loading = document.createElement('span')
  loading.textContent = 'Loading…'
  parent.insertBefore(loading, anchor)
  return { dispose: () => loading.remove() }
}
```

### P1. Svelte 렌더러 폐기가 외부 연결자의 정리를 기다리지 않는다

`<ViewstemView source>`가 소유한 화면에서 외부 연결자의 비동기 `dispose()`를 보류했다. Chromium에서 `await renderer.dispose()`가 이미 끝났지만 연결자의 정리는 계속 대기 중이었다. `ViewstemView`는 View와 Svelte의 `tick()`까지 기다리고, `Display`의 해제 경로는 `detach()`의 Promise를 반환하지 않는다. 명세에는 렌더러 폐기가 소유한 표시 연결의 정리까지 기다린다고 적혀 있다. [호스트 연결 명세](../spec/07-host-integration.md) · [Svelte 소유 View](../../packages/svelte/src/lib/ViewstemView.svelte) · [Svelte 표시 연결](../../packages/svelte/src/lib/Display.svelte)

소유 화면의 `detach()` 완료를 렌더러가 기다리는 정리 작업에 포함한다. 외부 연결자의 정리를 지연하거나 실패시키는 테스트를 추가하고, 빌린 View와 그 View의 다른 표시 연결이 계속 동작하는지도 검증한다.

### P1. 재사용할 코드 Action을 함수나 파일로 빼면 선언이 어려워진다

`defineResourceSet` 안에 인라인으로 작성한 Action은 입력과 출력을 추론한다. 같은 항목을 `const entry: CodeActionEntry`로 추출하면 출력 스키마가 `number`인데도 `() => 42`가 `TS2322`로 거절된다. 기본 제네릭이 출력을 `void`로 계산하기 때문이다. 또 공유 `Type`의 `typeRef`를 쓰면 값을 `unknown`으로 받는다. `ActionContext<{ value: string }>`를 명시한 함수도 셋 등록·교체에서 거절되고, 기존 `registerAction<{ value: string }, string>`은 같은 함수를 받는다. [코드 Action 입력 타입](../../packages/core/src/index.d.ts)

셋으로 반환된 `set.actions[0]`을 펼쳐 구현만 바꾼 뒤 교체 API에 넘겨도 타입 정보가 지워져 거절된다. `registry.get('Action', id)`에는 `requires`가 포함되지 않아 함수 교체에 필요한 계약을 그 조회 결과만으로 재구성할 수도 없다. 기존 `registerAction`의 명시 타입 인수와 동등한 엔트리 작성 경로를 두고, 추출한 엔트리가 셋 등록과 교체 양쪽에서 통과하도록 하는 것을 권한다. 리터럴 스키마는 현재 추론을 유지하고, 런타임 `typeRef`에는 작성자가 타입을 명시한다. [공개 타입](../../packages/core/src/index.d.ts) · [TypeScript 제네릭 매개변수 기본값](https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-parameter-defaults)

### P1. `authorize`에서 등록된 Action의 ID를 읽을 수 없다

`authorize({ operation: 'invoke', owner, definition })`의 `definition`은 Action 리소스 전체가 아니라 `spec`이다. 같은 Runtime에서 스키마가 동일한 이름 있는 두 Action을 호출하면, 공개 콜백은 동일한 owner와 구별할 수 없는 정의를 받는다. 객체 참조도 독립 호출의 스냅샷을 가로질러 안정적인 식별자가 아니다. 등록된 두 Action 중 하나만 허용하는 정책을 이 콜백 하나로 작성할 수 없다. [권한 콜백의 공개 타입](../../packages/core/src/index.d.ts) · [콜백 호출](../../packages/core/src/action.mjs) · [공개 권한 컨텍스트 변환](../../packages/core/src/api.mjs)

등록된 호출의 권한 컨텍스트에 읽기 전용 `resource: { kind: 'Action', id }`를 공급한다. 인라인 호출은 인라인임을 명시하고 정의를 제공한다. 구현 함수는 현재처럼 콜백에 전달하지 않는다. UI 이벤트, headless 호출, 하위 호출에서 같은 Action ID가 전달되는지 테스트한다.

### P1. 문서에서 `ready`, 스타일 스코프, Runtime 정리를 다르게 가르친다

Quickstart 본문은 아직 `ready`를 첫 DOM 완료로 설명한다. Browser mount 예제는 CSS 범위인 `data-viewstem-ui`를 빠뜨리고, 주입한 Runtime이 `renderer.dispose()`로 정리된다고 설명한다. Chromium에서 스코프를 넣어야 기본 버튼 스타일이 적용됐다. 주입한 Runtime으로는 렌더러를 폐기한 뒤에도 새 View를 만들 수 있었다. [Quickstart](../../apps/docs/src/content/docs/ko/docs/quickstart/index.md) · [브라우저 시작 가이드](../../apps/docs/src/content/docs/ko/docs/ui/guides/mount-in-browser.md) · [DOM Runtime 소유권](../../packages/dom/src/renderer.ts)

Svelte 레퍼런스는 다른 Runtime의 View를 빌릴 때 양쪽 Registry에 같은 구현을 등록하라고 안내한다. 두 Runtime에 같은 ID로 다른 구현을 넣은 Node 표시 테스트에서는 View가 확보한 구현을 사용했다. 렌더러가 공급해야 하는 것은 그 구현에 맞는 연결자다. [Svelte 레퍼런스](../../apps/docs/src/content/docs/ko/docs/svelte/viewstem-view.md) · [구현 선택과 연결](../../packages/dom/src/connection.ts)

`ready`는 View 준비와 표시 연결, `whenRendered()`는 해당 연결의 DOM 반영, `whenSettled(application)`은 해당 적용의 최초 Query 보고와 DOM 반영이라는 표를 시작 문서에 공통으로 둔다. 첫 예제 끝에 `await screen.whenRendered()`를 두고, 앱이 만든 Runtime은 앱이 `runtime.dispose()`로 정리한다. 다른 Runtime의 View를 빌리는 예제에는 구현의 출처와 렌더러에 필요한 연결자를 각각 보여준다.

## 설계와 레퍼런스 대조

| 비교한 관례 | Viewstem에 적용한 판단 |
|---|---|
| Vue는 앱에 플러그인을 명시적으로 설치하고 동일 플러그인 재설치를 한 번으로 처리한다. Fastify는 등록된 범위와 상속 규칙을 공개적으로 설명한다. [Vue `app.use()`](https://vuejs.org/api/application.html#app-use) · [Fastify 플러그인](https://fastify.dev/docs/latest/Reference/Plugins/) | 명시적 셋 등록과 동일 선언 재사용은 일관된 방향이다. 문자열 셋 ID와 `version`은 독립 셋을 같은 버전으로 자동 병합하는 약속이 아니다. 동일 선언 객체와 다른 선언의 중복 ID를 각각 예제로 설명해야 한다. View를 연 뒤 등록이 어디까지 보이는지도 첫 등록 예제에 넣는다. |
| React는 `root.render()` 직후 효과나 DOM을 읽는 시점에 한계가 있음을 문서화한다. Svelte는 `mount`와 DOM 갱신을 기다리는 `tick()`을 구분한다. [React `root.render`](https://react.dev/reference/react-dom/client/createRoot#root-render) · [Svelte `mount`](https://svelte.dev/docs/svelte/imperative-component-api#mount) · [Svelte `tick`](https://svelte.dev/docs/svelte/lifecycle-hooks#tick) | View 생성, DOM 반영, Query 보고를 따로 기다리는 설계가 타당하다. Viewstem은 그 위에 두 표시 연결의 독립적인 렌더 결과를 제공하므로, 어느 핸들이 무엇을 기다리는지 API 이름 옆에 바로 설명할 가치가 있다. |
| Lit는 한 컴포넌트의 `updateComplete`와 자식 갱신 완료를 구분하고, 연결과 해제 훅에서 자신의 자원을 관리하게 한다. [Lit 완료 시점](https://lit.dev/docs/components/lifecycle/#updatecomplete) · [Lit 연결 수명](https://lit.dev/docs/composition/controllers/#lifecycle) | 연결자의 `whenRendered(signal)`는 자신이 만든 DOM까지 기다리고, 표시 연결의 `whenRendered()`는 슬롯 자식까지 기다린다는 구분이 맞다. 공개 연결자 가이드에 `mount` → 구현 대기 → 자식 배치 → `afterChildren` 순서와 인스턴스·갱신 신호를 명시한다. |
| tRPC는 선언된 프로시저의 입력·출력 타입을 다른 파일에서 재사용할 수 있게 공개 타입 도구를 제공한다. [tRPC 개별 프로시저 타입](https://trpc.io/docs/client/vanilla/infer-types#inferring-individual-procedure-types) | 코드 Action도 등록할 위치를 정하기 전에 별도 파일에서 작성할 수 있어야 한다. 작성 단계에서 확보한 타입을 셋 등록과 교체까지 보존한다. |
| Node는 `exports`로 공개 진입점과 내부 모듈의 경계를 정하는 방식을 권장한다. [Node 패키지 진입점](https://nodejs.org/api/packages.html#package-entry-points) | Core 단독, DOM 단독, 공식·외부 연결자 혼합이 소스 내부 경로 없이 작동한다. 설치 문서와 발행 목록에도 이 패키지 경계를 반영해야 한다. |

## 개발자 경험에서 정리할 항목

### P2. Core 문서에서 등록, 추가 적용, 교체를 한 흐름으로 찾기 어렵다

Core의 Registry·View 레퍼런스에서 새 연산이 빠져 있고 Runtime 안내는 `view.invokeAction` 위주다. 같은 ID 함수를 교체한 뒤 `updateDefinition()`을 호출한 실험에서는 이전 함수와 State가 유지됐다. 그 셋을 `applyResourceSets()`로 전달하면 기존 구성의 교체를 요구하므로 거절됐다. `replace()`에 원래 필수 입력을 생략하면 준비에 실패하고, 입력을 다시 전달하면 새 함수와 새 View 내부 State를 사용했다. 소비자가 목적에 맞는 호출을 고를 수 있도록 아래 결정표와 실제 입력·URL 재전달 예제를 Core 문서에 둔다. [Core Registry 문서](../../apps/docs/src/content/docs/docs/core/registry.md) · [Core View 문서](../../apps/docs/src/content/docs/docs/core/view.md) · [View 적용 구현](../../packages/core/src/runtime.mjs)

| 원하는 결과 | 사용할 호출 |
|---|---|
| 새 View나 새 headless 호출에 리소스를 제공 | `registry.registerResourceSet(set)` |
| 열린 View 하나의 기존 수명을 유지하면서 새 셋을 추가 | `view.applyResourceSets({ setIds, definition?, inputs?, states? })` |
| 현재 구성에서 정의나 입력을 변경 | `view.updateDefinition()` / `view.setInputs()` |
| 게시된 교체를 열린 View에 적용하고 내부 수명을 새로 시작 | `view.replace(source, options)` |

### P2. headless Action을 요청 단위로 취소할 수 없다

`runtime.invokeAction({ actionRef, signal })`을 실행하면 `INVALID_DEFINITION`이 돌아온다. 코드 Action은 수명 신호를 받지만 공개 호출자는 하나의 호출에 자신의 신호를 전달할 수 없다. 공유 Runtime의 수명과 개별 서버 요청의 수명이 다를 때 호출마다 `AbortSignal`을 전달하는 옵션을 검토할 가치가 있다. 도입한다면 호출 전 abort, 실행 중 abort, 같은 Runtime의 다른 호출 유지, 이미 시작된 외부 효과의 의미를 함께 정한다. 웹 표준과 같은 입력 형식을 선택하더라도 오류는 제품의 기존 `CANCELLED` 계약에 맞출 수 있다. [Runtime 공개 경계](../../packages/core/src/api.mjs) · [WHATWG의 취소 신호 통합](https://dom.spec.whatwg.org/#abortcontroller-api-integration)

### P2. 공통 렌더러 경험을 가르치는 예제와 외부 연결자 레퍼런스가 부족하다

DOM의 `createRenderer`는 `runtime`을 필수로 받고, Svelte의 같은 이름의 함수는 인수를 생략하면 Runtime도 소유한다. 공개 연결자에는 `update`, `setPending`, `whenRendered`, `dispose`가 모두 필수여서 동기 DOM 구현도 일부 메서드를 빈 함수로 채운다. 패키지 이름을 같은 API의 프레임워크별 진입점처럼 가르치려면 `createRenderer({ runtime })`를 공통 예제로 쓰고 Svelte의 자동 Runtime 생성과 정리는 편의 경로로 설명하는 편이 변경 비용이 낮다. [DOM 렌더러 타입](../../packages/dom/src/renderer.ts) · [Svelte 옵션 타입](../../packages/svelte/src/lib/types.ts) · [연결자 타입](../../packages/dom/src/connector.ts)

추가로 간단한 DOM 구현 하나와 늦게 슬롯을 제공하는 외부 연결자 하나를 문서에 싣는다. 구현 대기와 대기 표시를 쓰지 않는 동기 연결자에서 두 훅을 선택으로 둘지는 예제의 반복 코드량을 보고 결정할 수 있다. `update`와 `dispose`까지 선택으로 두면 누락한 갱신과 정리를 일찍 발견하기 어려워진다. 같은 Core 모듈 인스턴스에서 만든 셋만 등록할 수 있다는 제약도 외부 셋 배포 안내에 넣는다. 소비자 패키지가 Core를 별도로 번들하면 브랜드 검사가 실패하는 것은 두 모듈 사본으로 재현됐다. [DOM 사용법](../../packages/dom/README.ko.md) · [셋 브랜드 검사](../../packages/core/src/resource-set.mjs) · [npm peer 의존성 문서](https://docs.npmjs.com/files/package.json/#peerdependencies)

## 검증 근거

EGM의 이해도, 설계 비평, 구현 근거를 새 컨텍스트의 리뷰어 세 명이 독립적으로 검토했다. 앞의 두 관점은 명세를 먼저 읽고 공개 사용 경로를 검증했다. 마지막 관점은 명세가 약속한 패키지 경계와 표시 연결 수명을 공개 진입점의 구현과 대조했다.

| 관점 | 확인한 결과 |
|---|---|
| 처음 사용하는 소비자의 이해도 | 명세를 읽으면 `mount`는 View를 소유하고 `attach`는 빌린다는 흐름을 복원할 수 있었다. 실제 첫 화면 예제에서는 패키지 의존성, 스타일 범위, 대기 시점 설명이 어긋났다. |
| 공개 API 설계 | 독립 모듈의 Action 등록·교체 타입과 같은 입력 계약을 가진 두 Action의 권한 콜백을 비교했다. |
| 문서와 구현의 일치 | 공개 ESM 내보내기, 두 Runtime의 구현 선택, fallback 정리, Svelte 렌더러 폐기 Promise를 확인했다. |

- 공개 패키지 소비 테스트를 다시 실행했다. 임시 앱에서 Core 단독, DOM 단독, 외부·공식 연결자 혼합 세 구성이 통과했다. [독립 패키지 소비 테스트](../../packages/dom/test/public-consumer.test.mjs)
- 별도 소비자에서 문서 명령 그대로의 설치와 DOM tarball을 추가한 대조군을 실행했다. 기존 Svelte 앱 예제의 원문과 가져오기를 추가한 대조군을 Chromium에서 확인했다.
- TypeScript 소비자에서 인라인 등록, 추출한 `CodeActionEntry`, `typeRef`의 명시 핸들러, 기존 직접 등록을 비교했다. Node 공개 진입점에서 호출 취소 옵션과 Action 권한 컨텍스트를 확인했다. Chromium에서 fallback의 입력 대기→준비 전환과 연결자의 정리를 보류한 Svelte 렌더러 폐기를 실행했다.

## 후속 정리

- 한·영 설치, 첫 화면, Svelte 기존 앱 예제와 Core 레퍼런스를 공개 API에 맞췄다. 한·영 설치 명령으로 만든 독립 앱에서 README, Browser mount, Quickstart, Svelte 기존 앱 예제를 각각 Chromium으로 실행했다. [설치 안내](../../apps/docs/src/content/docs/ko/docs/installation/index.md) · [View 레퍼런스](../../apps/docs/src/content/docs/ko/docs/core/view.md)
- DOM은 `void` fallback의 표시 범위를 정리한다. Svelte `renderer.dispose()`는 `<ViewstemView source>`의 외부 연결자 정리를 기다린다. 두 동작의 수정 전 실패와 수정 후 통과를 Chromium에서 확인했다. [DOM 테스트](../../packages/dom/test/browser.test.mjs) · [Svelte 테스트](../../packages/svelte/test/browser.test.mjs)
- 발행 대상 선택에 DOM을 추가하고 최초 DOM 매니페스트와 의존 순서를 테스트했다. 실제 npm 공개 발행은 별도 단계다. [발행 대상 테스트](../../.github/scripts/npm-release.test.mjs)
- 코드 Action은 `defineCodeAction()`으로 계약을 한 번 선언하고 `.implement()`로 셋 등록과 구현 교체에 쓸 엔트리를 만든다. 리터럴 스키마와 명시적 `typeRef`의 타입 유지를 Core의 공개 타입 테스트와 독립 tarball 소비에서 검증했다. [D154](../spec/04-action.md#코드-action-등록과-갱신)
- `authorize`는 실제 실행에 쓰는 Registry 스냅샷에서 해석한 Action의 읽기 전용 `resource`를 받는다. 인라인과 하위 호출, Registry 교체 뒤 기존 View와 새 실행의 대상 식별을 검증했다. [D159](../spec/07-host-integration.md#action-실행-권한)
- Runtime·View의 독립 Action 호출은 선택적 `signal`을 받는다. 권한 검사 전 취소, 실행 중 해당 호출과 하위 호출의 취소, 다른 독립 호출과 기존 효과의 보존을 검증했다. [D160](../spec/07-host-integration.md#독립-action-호출의-취소)
- 연결자의 `whenRendered(signal)`은 선택으로 두고 `update()`, `dispose()`, `setPending()`은 필수로 둔다. 동기 연결자의 대기·복구와 비동기 슬롯 자식의 완료 대기를 Chromium에서 검증했다. [D161](../spec/12-resource-sets-browser.md#연결자-자체의-렌더-완료) · [공개 API 후속 구현 순서](viewstem-resource-sets-implementation-2026-11-16.md#공개-api-후속-구현-순서)
