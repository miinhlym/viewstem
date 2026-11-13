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
| `components?: readonly ComponentRegistration[]` | 생성 | 코드 Component 계약과 Svelte 구현을 함께 등록합니다. 주입 Registry와 함께 전달할 수 없습니다. |
| `registry?: Registry` | 생성 | 기존 Core Registry를 사용합니다. 기본값은 `functions`로 설정한 새 Registry입니다. |
| `stateStore?: StateStore` | 생성 | 호스트 소유 StateStore를 사용합니다. 기본값은 새 Runtime이 소유하는 Store입니다. |
| `requestExecutor?: RequestExecutor` | 생성 | Query의 HTTP 요청 계획을 주어진 콜백과 중단 신호로 실행합니다. 기본값은 Core의 HTTP 실행기입니다. |
| `resourceResolver?: RuntimeOptions['resourceResolver']` | 생성 | View를 생성하거나 교체할 때 없는 리소스 정의를 제공합니다. 요청받은 종류와 ID에 해당하는 정의를 값이나 Promise로 반환합니다. 이 콜백의 제한 시간 정책은 `requestTimeoutMs`와 별개입니다. |
| `authorize?: RuntimeOptions['authorize']` | 생성 | Action 호출과 기존 View 변경을 동기적으로 인가합니다. 허용할 때 `true`를 반환합니다. |
| `functions?: readonly CelFunction[]` | 생성 | 사용자 정의 CEL 함수를 실행에 사용합니다. 렌더러가 Registry를 생성하면 정의 검증에도 적용합니다. 기존 Registry를 주입하면 그 Registry의 함수를 사용합니다. |
| `requestTimeoutMs?: number` | 생성 | Core HTTP 요청의 제한 시간입니다. 밀리초 단위 양의 안전 정수를 받으며 기본값은 `30000`입니다. |
| `clock?: TimerClock` | 생성 | Query 타임아웃과 폴링에 쓰는 시계와 타이머를 공급합니다. 기본값은 Core 내장 타이머입니다. |
| `onError?: RendererErrorListener` | 공통 | 이 렌더러의 연결에서 발생한 진단을 관찰합니다. |

Runtime 필드에는 [Core 타입](/ko/docs/core/types/)을 사용합니다. `onError`는 [진단](../errors/#rendererdiagnostic)을 참고하세요.

## Renderer

### runtime과 컴포넌트 연결

`renderer.runtime.registry`로 Runtime 레지스트리에 접근합니다. 렌더러 생성 시 `components: [{ contract, component }]`를 제공하거나 기존 코드 Component 계약에 `renderer.bindComponent(id, component)`를 호출합니다.

<a id="mount-and-attach"></a>
<a id="mount"></a>
<a id="attach"></a>

### mount와 attach

`renderer.mount({ target, source, inputs?, url?, onError? })`는 화면 핸들을 동기 반환합니다. `screen.ready`로 View를 얻습니다. `renderer.attach(view, target, options?)`는 기존 View를 빌립니다. [화면과 연결 수명](../mounted-view/)을 참고하세요.

### dispose

`await renderer.dispose()`는 렌더러의 `mount()`와 `attach()`로 만든 연결과 내부 Runtime을 정리합니다. 주입한 Runtime은 호스트가 관리합니다. `ViewstemView`가 `source`로 시작한 작업과 소유 View도 정리합니다. `view`를 넘긴 연결은 Svelte 트리에서 제거해 정리하세요. `dispose()`는 반복 호출해도 안전합니다.

## RenderOptions

`mount`와 `attach`에 적용됩니다. `mount` 인자의 필드로 전달하거나 `attach`의 세 번째 인자에 넣으세요.

| 필드 | 의미 |
| --- | --- |
| `context?: Map<unknown, unknown>` | 렌더러가 생성하는 루트의 Svelte 컨텍스트입니다. 어댑터는 Svelte 컨텍스트 API로 값을 읽을 수 있습니다. |
| `onError?: RendererErrorListener` | 렌더러 전체 관찰자와 별도로 이 연결의 진단을 관찰합니다. |
| `fallback?: RenderFallback` | 렌더링 실패와 자리표시자 노드에 사용할 Svelte snippet을 전달합니다. |

앱 트리의 자식으로 렌더링할 때는 [`ViewstemView`](../viewstem-view/)와 앱의 Svelte 컨텍스트를 사용하세요.
