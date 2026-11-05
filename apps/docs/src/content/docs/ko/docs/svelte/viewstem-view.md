---
title: ViewstemView
description: 기존 Svelte 컴포넌트 트리에서 빌린 Core View를 렌더링합니다.
sidebar:
  order: 4
---

## ViewstemView

Svelte 컴포넌트 트리에서 View를 표시할 위치에 `ViewstemView`를 배치합니다. `@viewstem/svelte`에서 가져와 렌더러와 Core View를 전달하세요. 부모 컴포넌트와 Svelte 루트 설정은 [마운트 가이드](../guides/mount-in-svelte/)에서 확인할 수 있습니다.

**타입** · `Component<ViewstemViewProps, { whenRendered(): Promise<void> }>`

컴포넌트는 부모의 Svelte 컨텍스트를 상속합니다. `renderer`나 `view` prop이 바뀌면 Svelte 연결을 교체합니다. 언마운트하면 연결과 구독을 해제합니다. View와 Runtime은 해당 인스턴스를 소유한 호스트가 폐기합니다.

## ViewstemViewProps

| Prop | 타입 | 의미 |
| --- | --- | --- |
| `readonly renderer` | `Renderer` | Registry, 어댑터, 렌더러 수준 진단을 제공합니다. |
| `readonly view` | `View` | 렌더링할 기존 Core View입니다. |
| `readonly onError?` | `RendererErrorListener` | 이 연결에서 발생한 진단을 관찰합니다. |
| `readonly fallback?` | `RenderFallback` | 자리표시자나 실패 노드를 Svelte snippet으로 표시합니다. |

어댑터가 던진 임의 값을 안전하게 처리하려면 [`transformError`](../errors/#transformerror)를 Svelte 루트의 오류 변환 정책으로 사용하세요. 정책은 Svelte 루트 전체에 적용됩니다.

## whenRendered

Svelte의 `bind:this`로 얻은 인스턴스는 `whenRendered(): Promise<void>`를 제공합니다. 타입을 지정하려면 호스트 스크립트에 `let rendered = $state.raw<ReturnType<typeof ViewstemView>>()`를 선언하고 컴포넌트에 `bind:this={rendered}`를 추가하세요. 인스턴스가 준비된 뒤 메서드를 호출합니다. 현재 Svelte DOM 갱신을 기다리며 현재 렌더링 오류가 있거나 연결이 폐기되면 거절됩니다. 실행 가능한 최초 Query도 기다리려면 Core 연산의 `initialComplete`를 기다린 뒤 인스턴스 메서드를 호출하세요.

<a id="borrowing-a-view"></a>

## 기존 View 빌리기

View와 렌더러가 같은 Runtime을 사용하면 동일한 Registry를 참조합니다. 호스트가 소유한 Runtime을 공유하려면 `createRenderer({ runtime })`으로 렌더러를 생성하세요.

다른 Runtime의 View라면 참조하는 각 Component ID의 코드형 또는 선언형 종류가 두 Registry에서 일치해야 합니다. 코드형 Component마다 같은 공개 계약과 Svelte 구현을 등록하세요. 렌더러는 자체 Registry와 어댑터 등록을 사용하며 두 Registry의 호환성 검증은 호스트가 담당합니다.

같은 규칙이 [`renderer.attach`](../renderer/#attach)에도 적용됩니다. Svelte 앱의 자식 컴포넌트로 렌더링하려면 `ViewstemView`를, DOM 요소에 렌더러가 관리하는 루트를 만들려면 `attach`를 사용하세요.
