---
title: createRenderer와 Renderer
description: 렌더러를 설정하고 어댑터를 등록한 뒤 View를 DOM 요소에 연결합니다.
sidebar:
  order: 1
---

## createRenderer

Svelte 렌더러를 만들고 `Renderer` 핸들을 반환합니다. 어댑터를 등록하거나 View를 연결하기 전에 호출하세요.

```ts
import { createRenderer } from '@viewstem/svelte';
import type { Renderer, RendererOptions } from '@viewstem/svelte';
```

**시그니처** · `createRenderer(options?: RendererOptions): Renderer`

`createRenderer()`는 빈 Registry를 가진 Core Runtime을 생성해 소유합니다. 각 렌더러는 자체 Svelte 어댑터를 관리합니다. 첫 어댑터 등록과 Runtime 사용은 [Svelte 앱에 View 마운트하기](../guides/mount-in-svelte/)에서 확인할 수 있습니다.

## RendererOptions

Runtime을 만들거나 기존 Runtime을 주입할 수 있습니다. 두 방식 모두 `onError`를 받습니다. `runtime`과 Runtime 생성 옵션을 함께 전달하면 TypeScript 검사에 실패하고 런타임에서 `INVALID_DEFINITION`이 발생합니다.

| 필드 | 방식 | 의미 |
| --- | --- | --- |
| `runtime?: Runtime` | 주입 | 기존 Runtime을 빌려 그 Registry를 사용합니다. Runtime의 소유자는 호스트입니다. |
| `registry?: Registry` | 생성 | 기존 Core Registry를 사용합니다. 기본값은 `functions`로 설정한 새 Registry입니다. |
| `stateStore?: StateStore` | 생성 | 호스트 소유 StateStore를 사용합니다. 기본값은 새 Runtime이 소유하는 Store입니다. |
| `requestExecutor?: RequestExecutor` | 생성 | Query의 HTTP 요청 계획을 주어진 콜백과 중단 신호로 실행합니다. 기본값은 Core의 HTTP 실행기입니다. |
| `resourceResolver?: RuntimeOptions['resourceResolver']` | 생성 | View를 생성하거나 교체할 때 없는 리소스 정의를 제공합니다. 요청받은 종류와 ID에 해당하는 정의를 값이나 Promise로 반환합니다. 이 콜백의 제한 시간 정책은 `requestTimeoutMs`와 별개입니다. |
| `authorize?: RuntimeOptions['authorize']` | 생성 | Action 호출과 기존 View 변경을 동기적으로 인가합니다. 허용할 때 `true`를 반환합니다. |
| `functions?: readonly CelFunction[]` | 생성 | 사용자 정의 CEL 함수를 실행에 사용합니다. 렌더러가 Registry를 생성하면 정의 검증에도 적용합니다. 기존 Registry를 사용하면 기본적으로 그 Registry의 함수로 실행합니다. `functions`도 전달하는 경우 두 곳의 함수 계약을 맞추세요. |
| `requestTimeoutMs?: number` | 생성 | Core HTTP 요청의 제한 시간입니다. 밀리초 단위 양의 안전 정수를 받으며 기본값은 `30000`입니다. |
| `clock?: TimerClock` | 생성 | Query 타임아웃과 폴링에 쓰는 시계와 타이머를 공급합니다. 기본값은 Core 내장 타이머입니다. |
| `onError?: RendererErrorListener` | 공통 | 이 렌더러에 연결된 View의 렌더링 및 이벤트 진단을 관찰합니다. |

Runtime 필드에는 [Core 타입](/ko/docs/core/types/)을 사용합니다. `onError`는 [진단](../errors/#rendererdiagnostic)을 참고하세요.

## Renderer

### runtime과 registry

| 속성 | 타입 | 의미 |
| --- | --- | --- |
| `readonly runtime` | `Runtime` | View를 생성하고 Action을 실행하는 Core Runtime입니다. |
| `readonly registry` | `Registry` | `renderer.runtime.registry`와 같은 Registry입니다. 이 핸들로 리소스, 코드형 Component 계약, 코드형 Action을 등록합니다. |

### registerComponent

**시그니처** · `registerComponent(id: string, component: ComponentAdapter): void`

기존 코드형 Component ID에 Svelte 컴포넌트 하나를 연결합니다. 먼저 `registry.registerComponentContract` 또는 `registry.registerComponentContracts`로 공개 계약을 등록하세요. 미등록 ID를 조회하면 `REFERENCE_NOT_FOUND`가 발생합니다. 선언형 Component ID, 중복 어댑터, 함수가 아닌 구현을 전달하면 `INVALID_DEFINITION`이 발생합니다.

### registerComponents

**시그니처** · `registerComponents(entries: readonly ComponentRegistration[]): void`

새 코드형 계약과 Svelte 구현을 한 번에 등록합니다. 각 항목에는 `contract`와 `component`가 들어갑니다. ID가 중복되거나 기존 계약과 충돌하거나 항목의 형태가 잘못되면 `INVALID_DEFINITION`이 발생합니다. 계약이 Core 검증에 실패하면 Core가 더 구체적인 오류를 반환할 수 있습니다. 배치가 실패하면 기존 계약과 어댑터 등록 상태가 유지됩니다. Core에 이미 계약을 등록했다면 [`registerComponent`](#registercomponent)를 사용하세요.

새로 등록한 어댑터는 새 연결에서 사용합니다. 기존 연결에는 `replace`로 새 View 수명을 시작할 때 반영됩니다. `update`는 현재 어댑터 집합을 유지합니다. [어댑터 레퍼런스](../adapters/#componentregistration)와 [등록 예제](../guides/write-an-adapter/)를 참고하세요.

### mount

**시그니처** · `mount(target: ViewTarget & RenderOptions & { readonly target: Element }): Promise<MountedView>`

렌더러가 소유할 View를 생성해 전달받은 DOM 요소에 표시합니다. 등록 ID인 `viewRef` 또는 인라인 정의인 `view`를 전달합니다. Core 타깃의 선택 필드는 루트 포트용 `inputs`와 State URL 바인딩용 `url`입니다. [Core의 `ViewTarget`](/ko/docs/core/runtime/#viewtarget)과 [`RenderOptions`](#renderoptions)를 참고하세요.

View 구조 생성과 Svelte 연결이 끝나면 [`MountedView`](../mounted-view/#mountedview)로 이행합니다. 최초 Query가 실행되는 동안에도 준비된 노드는 렌더링할 수 있습니다. 최초 Query의 완료와 DOM 반영은 `mounted.initialComplete`로 별도로 기다립니다.

View 생성이나 연결이 실패하면 마운트 Promise가 거절되고 타깃이 해제됩니다. 잘못된 타깃이거나 렌더러 연결에서 이미 사용 중인 요소는 `INVALID_DEFINITION`으로 거절됩니다. 렌더러를 폐기한 뒤 View 생성이 끝나면 View를 연결하기 전에 폐기하고 마운트 Promise를 `CANCELLED`로 거절합니다. [수명 관리 가이드](../guides/manage-view-lifecycle/)를 참고하세요.

### attach

**시그니처** · `attach(view: View, target: Element, options?: RenderOptions): RenderAttachment`

기존 Core View를 DOM 요소에 표시하고 [`RenderAttachment`](../mounted-view/#renderattachment)를 동기적으로 반환합니다. `mount`와 동일하게 요소 하나에 렌더러 연결 하나만 만들 수 있습니다. 연결은 View를 빌립니다. 연결을 시작하지 못하면 동기적으로 예외를 던집니다. Query 실행에는 기존 Core 완료 Promise를, DOM 반영에는 `attachment.whenRendered()`를 사용하세요.

같은 Registry를 공유하려면 렌더러의 Runtime에서 만든 View를 사용하세요. 다른 Runtime의 View는 참조된 Component 종류, 코드형 계약, 구현을 직접 맞춰야 합니다. [기존 View 빌리기](../viewstem-view/#borrowing-a-view)를 참고하세요.

### dispose

**시그니처** · `dispose(): Promise<void>`

렌더러 연결을 종료하고 관리하던 DOM 루트를 해제하며 `mount`로 만든 View를 폐기합니다. 렌더러가 생성한 Runtime과 그 Runtime에서 직접 만든 View도 폐기됩니다. 주입한 Runtime과 호스트 소유 StateStore는 호스트가 계속 사용할 수 있습니다. 다른 Runtime에서 빌린 View도 유지됩니다.

반환한 Promise는 연결 해제와 진행 중인 `mount`의 정리가 끝날 때까지 기다립니다. 실행 중인 호스트의 `resourceResolver`가 완료될 때까지 폐기가 지연될 수 있습니다. Resolver의 취소와 제한 시간 정책은 호스트가 관리합니다. 반복 호출은 같은 폐기 Promise를 반환합니다. 정리 도중 오류가 발생하면 이 Promise가 거절될 수 있습니다. 폐기 이후의 등록과 연결은 `CANCELLED`로 실패합니다.

## RenderOptions

`mount`와 `attach`에 적용됩니다. `mount` 인자의 필드로 전달하거나 `attach`의 세 번째 인자에 넣으세요.

| 필드 | 의미 |
| --- | --- |
| `context?: Map<unknown, unknown>` | 렌더러가 생성하는 루트의 Svelte 컨텍스트입니다. 어댑터는 Svelte 컨텍스트 API로 값을 읽을 수 있습니다. |
| `onError?: RendererErrorListener` | 렌더러 전체 관찰자와 별도로 이 연결의 진단을 관찰합니다. |
| `fallback?: RenderFallback` | 렌더링 실패와 자리표시자 노드에 사용할 Svelte snippet을 전달합니다. |

앱 트리의 자식으로 렌더링할 때는 [`ViewstemView`](../viewstem-view/)와 앱의 Svelte 컨텍스트를 사용하세요.
