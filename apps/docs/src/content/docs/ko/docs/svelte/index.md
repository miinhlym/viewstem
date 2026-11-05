---
title: Svelte 렌더러
description: 명시적으로 등록한 어댑터로 Svelte 앱에 Viewstem View를 렌더링합니다.
sidebar:
  order: 1
---

`@viewstem/svelte`는 Svelte `^5.57.3`을 사용하는 클라이언트에서 Viewstem View를 렌더링합니다. Core는 정의를 검증하고 입력을 평가하며 State, Query, Action을 실행합니다. Svelte 렌더러는 View를 구독하고 평가된 노드를 등록된 어댑터에 전달합니다.

컴포넌트, 마크업, 스타일은 앱에서 제공합니다. 자체 어댑터를 등록하거나 [선택형 Svelte UI 패키지](/ko/docs/svelte-ui/)를 사용할 수 있습니다. 렌더러는 Core에 의존하며 Svelte 앱에서 쓸 수 있도록 공용 Core 타입을 재노출합니다. 패키지 준비 방법은 [설치](/ko/docs/installation/)를 참고하세요.

## 연결 방식 선택

| 원하는 작업 | 사용할 API | View 소유자 |
| --- | --- | --- |
| Svelte 컴포넌트 트리에 View 포함 | [`<ViewstemView>`](./viewstem-view/) | View를 만든 호스트 |
| 렌더러가 View를 생성해 DOM 요소에 표시 | [`renderer.mount`](./renderer/#mount) | 렌더러 연결 |
| 기존 View를 DOM 요소에 표시 | [`renderer.attach`](./renderer/#attach) | View를 만든 호스트 |

## 가이드

- [Svelte 앱에 View 마운트하기](./guides/mount-in-svelte/)
- [슬롯과 이벤트가 있는 어댑터 만들기](./guides/write-an-adapter/)
- [View 갱신, 교체, 폐기하기](./guides/manage-view-lifecycle/)

## API 레퍼런스

| 항목 | 공개 API |
| --- | --- |
| [렌더러 설정과 등록](./renderer/) | `createRenderer`, `Renderer`, `RendererOptions`, `RenderOptions` |
| [View 핸들과 완료 시점](./mounted-view/) | `MountedView`, `RenderAttachment` |
| [어댑터 계약](./adapters/) | `ComponentAdapter`, `ComponentAdapterProps`, `ComponentRegistration` |
| [Svelte 호스트 컴포넌트](./viewstem-view/) | `ViewstemView`, `ViewstemViewProps` |
| [오류와 폴백](./errors/) | `transformError`, `RendererDiagnostic`, `RendererErrorListener`, `RenderFallback` |
| [타입 색인](./types/) | 렌더러 전용 타입과 공용 Core 타입의 레퍼런스 |
