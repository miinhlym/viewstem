---
title: Svelte 렌더러 타입
description: 렌더러가 정의하는 공개 타입과 Svelte 패키지가 재노출하는 공용 Core 계약을 찾습니다.
sidebar:
  order: 6
---

렌더러가 정의한 타입과 패키지가 제공하는 공용 Core 타입은 `@viewstem/svelte`에서 `import type`으로 가져옵니다.

## 렌더러 타입

| 타입 | 레퍼런스 |
| --- | --- |
| `Renderer` | [Runtime과 등록 핸들](../renderer/#renderer) |
| `RendererOptions` | [생성 및 주입 옵션](../renderer/#rendereroptions) |
| `RenderOptions` | [DOM 연결 옵션](../renderer/#renderoptions) |
| `MountedView` | [소유 View와 적용 메서드](../mounted-view/#mountedview) |
| `RenderAttachment` | [DOM 연결 핸들](../mounted-view/#renderattachment) |
| `ComponentAdapter<Contract>` | [계약에 연결한 Svelte 컴포넌트 타입](../adapters/#componentadapter) |
| `ComponentAdapterProps<Contract>` | [노드 상태별 입력, 이벤트, 슬롯](../adapters/#componentadapterprops) |
| `ViewstemViewProps`, `ViewstemSourceProps`, `ViewstemViewComponentProps` | [직접 호스팅하는 Svelte 컴포넌트 props](../viewstem-view/#viewstemviewprops) |
| `RendererDiagnostic` | [렌더링 또는 이벤트 진단](../errors/#rendererdiagnostic) |
| `RendererErrorListener` | [진단 콜백](../errors/#renderererrorlistener) |
| `RenderFallback` | [폴백 snippet 시그니처](../errors/#renderfallback) |

## 공용 Core 타입

`ComponentBinding`은 `@viewstem/core`에서 가져옵니다. `svelteComponent()`는 계약과 구현을 담은 이 타입을 반환합니다. [컴포넌트 바인딩 레퍼런스](../adapters/#componentbinding)

Svelte 패키지는 리소스 정의와 호스트 연결에 사용하는 `ViewSpec`, `ComponentContract`, `ViewOptions`, `NodeSnapshot`, `View`, `Registry`, `Runtime`, `StateHandle`, `QueryHandle`, `PublicError` 등의 Core 타입을 재노출합니다. 각 타입의 계약은 [Core 타입 레퍼런스](/ko/docs/core/types/)에서 확인하세요. 정확한 재노출 목록은 [Svelte 패키지 진입점](https://github.com/miinhlym/viewstem/blob/main/packages/svelte/src/lib/index.ts)에 있습니다.
