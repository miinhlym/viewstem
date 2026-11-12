# @viewstem/svelte

[English](README.md) | 한국어

Viewstem은 [MIT 라이선스](LICENSE)로 배포합니다.

Viewstem core의 화면 projection을 Svelte 5에 연결하는 클라이언트 렌더러입니다. **기본 Component·Action·테마·CSS를 등록하지 않습니다.** 앱이 코드 Component의 공개 계약을 core Registry에 등록하고, 같은 ID의 실제 Svelte 구현을 렌더러에 연결합니다. State·Query·Action·when/repeat·slot 작성자 문맥은 core가 실행합니다.

`@viewstem/core`는 내부 dependency, Svelte `^5.57.3`는 peer dependency입니다. 앱은 `@viewstem/svelte`에서 API와 공통 타입을 가져오며 core를 직접 설치·import할 필요가 없습니다. 정확한 검증 버전과 제한은 저장소의 검증 기록을 따릅니다.

## 등록과 실행

```ts
import { createRenderer } from '@viewstem/svelte';
import Label from './Label.svelte';

const renderer = createRenderer();
renderer.registry.registerComponentContract({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
renderer.registerComponent('Label', Label);

const rendered = await renderer.mount({
  target: document.querySelector('main')!,
  view: { render: { id: 'greeting', componentRef: 'Label', inputs: { text: 'Hello Viewstem' } } },
});
await rendered.initialComplete;
// rendered.view exposes core State/Query handles and the public View API.
await rendered.dispose();
await renderer.dispose();
```

`registry.registerComponentContract(contract)`는 코드 Component의 공개 계약을 등록하고, `renderer.registerComponent(id, implementation)`은 그 ID의 Svelte 구현을 연결합니다. 구현 등록은 core 계약을 자동 생성하지 않습니다. 존재하지 않는 ID, 선언형 Component에 대한 코드 덮어쓰기, 동일 ID의 어댑터 중복 등록을 거절합니다. Svelte 구현 연결은 등록 당시 View를 즉시 바꾸지 않으며 새 mount/attach 또는 View의 새 `replace` 수명에서 반영합니다. `update`는 현재 주입된 정의·어댑터를 유지합니다.

여러 코드 Component를 함께 등록할 때는 `renderer.registerComponents(entries)`에 `readonly ComponentRegistration[]`을 전달합니다. 각 항목은 `{ contract, component }` 형태입니다. 같은 묶음의 ID가 중복되거나 기존 계약과 충돌하거나 항목이 유효하지 않으면 계약과 구현 등록 모두 적용되지 않습니다. 계약만 함께 등록하려면 `renderer.registry.registerComponentContracts(contracts)`를 사용합니다.

`createRenderer()`는 빈 Registry와 Runtime을 생성합니다. `renderer.registry`는 `renderer.runtime.registry`와 같은 객체이며 리소스·코드 Action 등록에 사용합니다. `ViewSpec`, `ComponentContract`, `StateHandle`, `QueryHandle`, `Runtime` 등 core의 공개 타입도 `@viewstem/svelte`에서 `import type`으로 가져올 수 있습니다. core의 실행 엔진을 그대로 사용하며 타입이나 상태를 복제하지 않습니다.

실행 export는 `createRenderer`, `ViewstemView`, `transformError` 세 개입니다. 공통 타입은 리소스 작성·호스트 연결에 필요한 목록만 명시 재노출합니다. 내부 엔진·타입 추론 보조 구현과 선택 실행기의 설정 타입은 포함하지 않습니다. 반환한 Registry/Runtime/View도 core의 공개 핸들이므로 내부 메서드는 호출할 수 없습니다. 이 정리 이후 재실행 결과는 같은 revision의 [API 검증 기록](../../docs/handoff/public-api-verification-results.json)을 따릅니다.

생성 옵션으로 `registry`, `stateStore`, `requestExecutor`, `resourceResolver`, `authorize`, `functions`, `requestTimeoutMs`, `clock`과 렌더 오류 관찰자 `onError`를 전달할 수 있습니다. 기존 Runtime을 공유할 때는 `createRenderer({ runtime, onError })`를 사용합니다. `runtime`과 Runtime 생성 옵션을 함께 주면 `INVALID_DEFINITION`이며 타입 검사도 거절합니다.

Registry를 생략하면 `functions`를 자동 Registry의 정의 검증과 Runtime 실행에 함께 사용합니다. Registry를 직접 전달할 때는 해당 Registry도 같은 함수 계약으로 구성합니다.

```ts
const renderer = createRenderer({ requestExecutor, resourceResolver });
// Or borrow an existing Runtime: const renderer = createRenderer({ runtime });
```

## Svelte 어댑터

어댑터는 공개 `ComponentAdapterProps`를 받는 Svelte Component입니다.

| prop | 의미 |
|---|---|
| `inputs` | core가 검증·평가한 읽기 전용 입력. Value와 명시 전달된 State/Query 핸들 |
| `node` | 현재 `NodeSnapshot`. 주소·세대·준비 상태·오류·이름별 slot 등 |
| `emit(name, payload)` | 현재 인스턴스의 core 이벤트 호출. 실제 Action 결과를 반환하거나 공통 오류로 reject |
| `renderSlot` | `Snippet<[name: string]>`. `{@render renderSlot('body')}`로 지정 slot 표시 |

입력을 임의 DOM attribute로 펼치거나 Svelte prop 이름으로 바꾸지 않습니다. `inputs`의 값은 직접 수정하지 않고, 명시 전달된 State 핸들이나 `emit`으로 쓰기를 수행합니다. 외부 Action 실행 상태를 버튼의 disabled 값에 자동 연결하지도 않습니다.

주소·세대가 있는 코드 Component는 준비 상태가 달라져도 같은 어댑터 인스턴스를 유지합니다. 어댑터가 `node.status`를 확인해 pending/error/missing 표시와 입력 비활성을 처리해야 합니다. 이때 `inputs`가 완전하지 않을 수 있습니다. `emit`은 **호출 순간의 core 상태**가 ready인 경우만 전달하며, 오래된 세대·해제된 연결은 CANCELLED입니다. 입력의 IME 처리·접근성·디자인은 실제 입력을 구현하는 호스트 어댑터의 책임입니다.

레이아웃과 DOM은 호스트 어댑터가 소유합니다. 렌더러는 암묵적인 Row/Column이나 wrapper DOM을 추가하지 않습니다. 이름 있는 slot은 core가 평가한 노드 배열을 원래 순서대로 렌더링하며, 선언형 Component는 core가 확장한 하위 화면으로 연결합니다. 같은 주소·세대의 표시 중인 반복 항목은 keyed 렌더링으로 Svelte 로컬 상태를 유지하고, 제거·재생성은 새 수명입니다. 선언형 부모의 입력이 미준비라 하위 projection이 생략되면 해당 하위 Svelte 화면은 분리되지만 core가 보존한 내부 상태는 유지됩니다.

## 기존 Svelte 앱에서 사용

공개 `ViewstemView`에 `{renderer, view}`를 전달합니다. `view`는 앱이 `runtime.createView`로 만든 core View입니다. 예제의 [App.svelte](../../packages/svelte/example/App.svelte)와 어댑터가 이 연결을 보여줍니다. 이 링크는 같은 revision의 소스 저장소용이며 tarball 안에 예제를 포함하지 않습니다.

다른 Runtime의 View도 빌릴 수 있습니다. 이때 View가 사용하는 모든 코드 Component의 동일한 공개 계약과 Svelte 구현을 renderer에 명시 등록해야 하며, 참조하는 Component ID의 코드형·선언형 구분이 renderer Registry와 충돌하지 않아야 합니다. 다른 Registry의 계약을 자동 복사하거나 호환성을 전체 대조하지 않습니다. 같은 Registry를 공유한 Runtime을 주입하면 이 등록 기준을 함께 유지할 수 있습니다.

`ViewstemView`를 직접 호스팅하는 앱은 Svelte root의 오류 변환 정책을 설정합니다.

```ts
import { mount } from 'svelte';
import { transformError } from '@viewstem/svelte';
import App from './App.svelte';

mount(App, { target: document.querySelector('main')!, transformError });
```

Svelte의 root `transformError`는 컴포넌트가 던진 값을 boundary보다 먼저 처리합니다. 제공한 함수는 Proxy·getter·원본 message/stack을 읽지 않고 정제된 오류 DTO를 반환합니다. root 오류 정책은 앱 전체에 적용되므로 다른 Svelte 오류 정책과 결합할 책임도 호스트에 있습니다. `renderer.mount/attach`는 자신의 Svelte root에 이 정책을 자동 적용합니다. 직접 호스팅 시 이 설정 없이 임의의 Proxy 예외까지 안전하게 처리한다고 보장하지 않습니다.

`ViewstemView`의 `onError`는 `{phase: 'render' | 'event', error, node?}`를 받습니다. 오류가 난 노드와 주소 없는 대기 projection은 선택적 `fallback: Snippet<[NodeSnapshot, PublicError | null]>`으로 표현할 수 있습니다. 기본 표시 UI는 없습니다. 렌더 오류는 해당 boundary에서 격리하고 다음 core projection에서 재시도합니다. core 이벤트 오류는 `emit`의 reject 의미를 유지하며, 관찰 콜백의 예외는 다른 실행을 중단하지 않습니다.

## 완료 신호와 수명

| API | 완료·소유권 |
|---|---|
| `renderer.mount({...ViewTarget, target, context?, onError?, fallback?})` | View를 생성·소유. 구조 준비 후 `{view, initialComplete, update, replace, whenRendered, dispose}` 반환 |
| `rendered.initialComplete` | core의 실행 가능한 최초 Query 완료 + 해당 세대의 Svelte DOM 반영. Query 오류는 core 보고에 남고, 렌더 오류·폐기·세대 교체는 reject |
| `rendered.update(spec, options?)` / `replace(target)` | core의 원자 적용·권한·수명 계약을 유지하며 반환한 `{initialComplete}`에도 DOM 완료를 포함 |
| `renderer.attach(view, target, options?)` | 기존 View를 빌림. `{view, whenRendered, dispose}` 반환. detach는 core View를 폐기하지 않음 |
| `<ViewstemView {renderer} {view}>` | 기존 View를 빌림. Svelte 해제는 구독·화면만 정리. `bind:this`의 `whenRendered()` 제공 |
| `whenRendered()` | 현재 Svelte DOM 반영을 기다림. Query 완료·브라우저 paint·호스트 컴포넌트의 모든 비동기 작업은 기다리지 않음 |
| `renderer.dispose()` | 연결된 화면과 자신이 mount한 View 정리. 내부 생성 Runtime도 폐기하며 그 Runtime에서 직접 만든 View도 종료. 주입 Runtime·외부 Store·다른 Runtime의 빌린 View는 보존 |

같은 Element에 renderer attachment를 중복 생성하면 거절합니다. 준비된 화면은 최초 Query를 기다리지 않고 표시합니다. 잘못된 core `update/replace`는 기존 View를 보존합니다. 호스트 어댑터의 표시 오류는 적용 후 실패이므로 core State 쓰기를 rollback하지 않습니다.

내부 생성 Runtime의 폐기는 진행 중인 Query·Action을 즉시 취소합니다. 주입한 Store를 사용할 때는 Runtime 자신의 View만 폐기하고 다른 StateScope의 State는 보존합니다. 비동기 `resourceResolver`는 호스트 콜백이므로 강제 중단하지 못하며, `dispose()`는 진행 중인 `renderer.mount`의 정리가 끝날 때까지 기다립니다. 해제 도중 늦게 준비된 View는 화면에 연결하지 않고 폐기합니다. resolver의 네트워크 중단과 timeout 정책은 호스트가 관리합니다.

## 실행과 검증

저장소 루트에서:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check:svelte
npm run example:svelte
```

예제 주소는 `http://127.0.0.1:4174`입니다. 네 개 예제 어댑터는 앱 코드이며 패키지 기본 등록이 아닙니다. `check:svelte`는 core/Svelte 빌드, strict 소비자 타입·예제 검사, 실제 Chromium 적합성 검사, 독립 tarball 소비자 설치·타입·DOM 검사를 수행합니다. 브라우저 테스트의 skip/todo도 실패입니다. Svelte-aware bundler가 배포된 `.svelte` 파일을 컴파일하는 패키지이며, 일반 Node에서 직접 DOM 렌더링하는 패키지가 아닙니다.

지원 범위는 Svelte 5 클라이언트 렌더러입니다. Svelte 4, SSR·hydration의 runtime 전달, 다른 브라우저 엔진·실제 모바일 IME, Grid/차트 UI·기본 디자인 시스템·공개 발행은 이번 검증 범위가 아닙니다. 현재 상세 기록은 같은 소스 revision의 [구현 인계](../../docs/handoff/svelte-implementation-2026-11-02.md)와 [검증 결과](../../docs/handoff/svelte-verification-results.json)를 따릅니다. 소스 문서는 tarball에 포함하지 않으며 발행된 tarball에는 해당 소스 커밋의 공개 문서 링크가 포함됩니다.

## 브라우저 기본 컴포넌트

기본 JSON 컴포넌트는 [@viewstem/ui](../ui/README.ko.md)로 브라우저 컨테이너에 렌더링합니다. 이 패키지는 앱 자체의 Svelte 어댑터를 렌더링합니다.
