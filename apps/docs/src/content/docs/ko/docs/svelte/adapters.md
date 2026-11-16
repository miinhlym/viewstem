---
title: Component 어댑터
description: 어댑터 props, 코드형 Component 등록, 슬롯, 준비 상태, 이벤트 전달을 설명합니다.
sidebar:
  order: 3
---

`ComponentAdapter`, `ComponentAdapterProps`, `ComponentRegistration`은 `@viewstem/svelte`에서 타입으로 가져옵니다. 전체 Svelte 예제는 [슬롯과 이벤트가 있는 어댑터 만들기](../guides/write-an-adapter/)를 참고하세요.

## ComponentAdapter

**타입** · `Component<ComponentAdapterProps>`

어댑터는 코드형 Component 인스턴스 하나를 렌더링하는 Svelte 컴포넌트입니다. `$props()`의 타입으로 `ComponentAdapterProps`를 사용하세요. 요소, 배치, 접근성, 입력 상호작용과 IME 처리는 호스트 어댑터가 담당합니다. 렌더러는 노드를 전달하고 Core가 결정한 슬롯 콘텐츠 순서를 보존합니다.

## ComponentAdapterProps

| Prop | 타입 | 의미 |
| --- | --- | --- |
| `inputs` | `NodeSnapshot['inputs']` | 평가된 읽기 전용 입력입니다. Value 입력과 명시적으로 전달한 State 및 Query 핸들이 포함됩니다. 하나의 객체에서 이름으로 읽습니다. |
| `node` | `NodeSnapshot` | 상태, 오류, 식별 정보, 이름 있는 슬롯을 담은 현재 Core 렌더링 스냅샷입니다. |
| `emit` | `(event: string, payload: unknown) => Promise<unknown>` | 노드에서 이벤트를 보내고 실제 Action 결과를 받습니다. |
| `renderSlot` | `Snippet<[name: string]>` | 지정한 슬롯의 자식을 순서대로 표시합니다. |

Prop은 읽기 전용입니다. 쓰기는 명시적으로 전달받은 State 핸들이나 이벤트를 사용합니다. 어떤 입력을 DOM 속성으로 사용할지는 어댑터가 결정합니다.

### 준비 상태와 노드 동일성

`node.status`는 `ready`, `pending`, `error`, `missing` 중 하나입니다. `ready` 외 상태에서는 일부 입력이 없을 수 있습니다. 상태를 표시하고 필요한 경우 컨트롤을 비활성화하세요. Action이 실행되는 동안 상호작용을 막을지도 어댑터가 결정합니다.

화면에 있는 코드형 노드는 주소와 세대가 같으면 준비 상태가 바뀌어도 Svelte 어댑터 인스턴스를 유지합니다. 키가 있는 반복에서는 순서를 바꿔도 Svelte 상태가 유지됩니다. 노드를 제거했다가 다시 만들면 새 수명이 시작됩니다. 선언형 부모의 입력이 준비되지 않아 Core가 자식 노드를 렌더링 스냅샷에서 일시적으로 생략하면 자식의 Svelte 인스턴스가 분리됩니다. 이때도 자식의 내부 State는 Core에서 유지할 수 있습니다.

### emit

계약이 `null` 페이로드를 받는 `reveal`을 선언했다면 `emit('reveal', null)`을 호출합니다. Core가 이벤트와 페이로드를 검증하고 View의 핸들러를 실행합니다. Promise는 `false`, `null`, `undefined`를 포함해 실제 Action 결과를 전달합니다. 핸들러가 없는 유효한 이벤트는 `undefined`로 이행합니다.

Svelte가 DOM을 갱신하는 중에도 호출 시점의 Core 준비 상태를 확인합니다. 노드는 있지만 준비되지 않았다면 `INPUT_NOT_READY`로 거절됩니다. 연결 해제, View 폐기, 노드 제거 또는 이전 세대의 노드는 `CANCELLED`로 거절됩니다. Core 이벤트와 Action 오류도 원래 Promise를 거절합니다. [이벤트 진단](../errors/#failure-and-recovery)을 참고하세요.

### renderSlot

`{@render renderSlot('body')}`처럼 계약에 선언한 슬롯 이름으로 snippet을 호출합니다. 슬롯이 비어 있거나 생략되면 자식을 렌더링하지 않습니다. Core는 슬롯을 제공한 작성자의 문맥에서 자식을 평가합니다. 어댑터는 마크업에서 슬롯을 표시할 위치를 정합니다.

## ComponentRegistration

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `readonly contract` | `ComponentContract` | `kind: 'Component'`, `id`, 포트·슬롯·이벤트를 선언한 공개 `spec`을 가진 Core 리소스입니다. |
| `readonly component` | `ComponentAdapter` | 같은 ID에 연결하는 Svelte 구현입니다. |

`createRenderer({ components })`에 계약과 어댑터를 전달하거나 기존 계약에 `renderer.bindComponent(id, component)`를 사용하세요.
