---
title: 브라우저 UI API
description: 카탈로그 등록, 기존 View 연결, 스타일과 지원 메타데이터 import를 설명합니다.
---

패키지 루트는 `registerShadcn`, `attach`와 TypeScript 타입 `Attachment`, `AttachOptions`를 제공합니다.

## 카탈로그 등록

```ts
registerShadcn(registry: Registry): void
```

카탈로그를 쓰는 View를 만들기 전에 [Core Registry](../../core/registry/)를 넘기세요. Component 계약 357개가 한 번에 등록됩니다. 중복 ID가 있으면 등록이 실패하고 Registry는 이전 상태를 유지합니다. Registry마다 한 번 호출하세요. 브라우저와 Svelte 카탈로그를 함께 실행할 때는 같은 Component ID를 사용하므로 Registry를 따로 만드세요.

## View 연결

```ts
interface AttachOptions {
  onError?: (error: unknown) => void;
}

interface Attachment {
  dispose(): void;
}

attach(view: View, target: HTMLElement, options?: AttachOptions): Attachment
```

기존 [Core View](../../core/view/)와 문서에 연결된 요소를 넘기세요. 요소 하나에 활성 연결 하나를 둘 수 있습니다. 연결 객체는 View를 구독하고 받은 투영을 DOM에 동기적으로 적용합니다. 대기 중이거나 실패한 노드는 준비될 때까지 DOM에 표시되지 않습니다.

컨테이너가 문서에 연결되지 않았거나 이미 사용 중이거나 초기 연결에 실패하면 `attach()`가 예외를 던집니다. 이후 발생한 렌더링·이벤트 오류를 받으려면 `onError`를 넘기세요. 초기 실행과 Query 진단은 `runtime.createView()`가 반환한 `initialComplete`를 기다려 확인할 수 있습니다.

`attachment.dispose()`는 구독을 해제하고 연결이 소유한 DOM 하위 트리와 이벤트 리스너를 정리합니다. 컨테이너를 제거하기 전에 호출하세요. 정리한 요소에는 다시 연결할 수 있습니다. View와 Runtime의 수명은 각각 호스트에서 관리합니다.

## 스타일과 메타데이터

| Import 경로 | 내용 |
|---|---|
| `@viewstem/ui/styles.css` | 렌더러 영역에 적용되는 Basecoat Vega 스타일과 Neutral 팔레트 |
| `@viewstem/ui/support.json` | 컴포넌트 ID별로 지원하는 입력 포트, 슬롯, 이벤트 |

브라우저 진입점에서 스타일시트를 import하세요. 어두운 팔레트는 마운트 컨테이너의 조상 요소에 `.dark` 클래스나 `data-theme="dark"` 속성을 지정해 적용합니다. 메타데이터 구조와 카탈로그의 지원 범위는 [컴포넌트와 JSON 지원](../components/)에서 확인하세요.
