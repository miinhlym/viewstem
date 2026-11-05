---
title: MountedView와 RenderAttachment
description: View 핸들로 렌더링을 기다리고 정의를 적용하거나 연결을 정리합니다.
sidebar:
  order: 2
---

두 타입 모두 `@viewstem/svelte`에서 가져옵니다. [`renderer.mount`](../renderer/#mount)는 `MountedView`를, [`renderer.attach`](../renderer/#attach)는 `RenderAttachment`를 반환합니다.

## RenderAttachment

| 멤버 | 시그니처 | 동작 |
| --- | --- | --- |
| `view` | `readonly view: View` | 연결한 Core View입니다. Core API로 State, Query, 스냅샷, 정의 변경에 접근합니다. |
| `whenRendered` | `whenRendered(): Promise<void>` | Svelte가 현재 렌더링 스냅샷을 DOM에 반영할 때까지 기다립니다. 현재 렌더링 오류가 있거나 연결이 폐기되면 거절됩니다. |
| `dispose` | `dispose(): Promise<void>` | Svelte 루트와 구독을 해제합니다. `attach`에 전달한 View는 View를 만든 쪽이 계속 소유합니다. |

타깃을 다시 사용하기 전에 `dispose()`를 기다리세요. 반복 호출은 같은 Promise를 반환합니다. 정리가 실패해도 정리가 끝나는 시점에 타깃은 해제됩니다. 공용 핸들은 [Core View 타입](/ko/docs/core/view/)을 참고하세요.

## MountedView

`RenderAttachment`를 확장합니다. `mount`가 View를 생성해 소유하므로 `mounted.dispose()`는 Core View와 해당 View의 실행도 폐기합니다. 개별 연결을 폐기해도 렌더러는 다른 View에 사용할 수 있습니다.

### initialComplete

**타입** · `readonly initialComplete: Promise<InitialReport>`

마운트 세대에서 Core가 최초로 실행할 수 있는 Query와 그 결과의 Svelte DOM 반영을 기다립니다. 보고서 형태는 `{ generation, queryErrors }`입니다. 개별 Query 오류는 `instanceId`, `query`, `error`를 가진 `queryErrors` 항목으로 전달됩니다. 실행 조건이 닫혔거나 필요한 입력이 준비되지 않은 Query는 완료를 지연시키지 않습니다.

렌더링 오류가 있으면 Promise가 거절됩니다. 완료 전에 폐기되거나 이후 적용 세대가 현재 세대를 대체해 대기가 취소되면 `CANCELLED`로 거절됩니다. 핸들의 원래 Promise는 마운트만 가리킵니다. 이후 작업은 그 작업의 반환값으로 기다리세요.

### update

**시그니처** · `update(spec: ViewSpec, options?: Parameters<View['update']>[1]): Promise<ApplicationResult>`

완전한 `ViewSpec`을 현재 수명에 적용합니다. Core가 변경을 검증·인가하고 호환되는 State와 기존 연결을 유지합니다. 주소와 세대가 같은 노드는 Svelte 로컬 상태를 유지할 수 있습니다.

- `options.inputs`는 루트 입력 맵을 지정합니다. 생략하면 현재 입력을 유지합니다.
- `options.states`는 선언된 루트 State 셀에 명시적으로 쓸 값을 지정합니다. 값을 검증한 뒤 갱신에 반영합니다.

반환하는 `{ initialComplete }`는 새로 적용한 세대의 최초 Query와 DOM 반영을 기다립니다. 잘못된 Core 갱신은 적용 전에 거절됩니다. 적용 후 어댑터가 실패하면 Core 변경이 적용된 상태에서 `initialComplete`가 거절될 수 있습니다. 갱신의 대상은 실행 중인 View 정의입니다. Registry에 등록한 정의를 수정하려면 별도로 `registry.updateResource`를 사용하세요.

### replace

**시그니처** · `replace(target: ViewTarget): Promise<ApplicationResult>`

같은 View 핸들과 연결 안에서 새 수명을 시작합니다. 인라인 `view` 또는 등록된 `viewRef`와 함께 `inputs`, `url`을 선택적으로 전달합니다. Core는 현재 Registry를 사용하고 Svelte 연결은 현재 어댑터 집합을 가져옵니다. 이전 수명의 내부 State와 실행은 폐기됩니다. 교체 후에는 State나 Query 핸들을 다시 얻으세요.

반환하는 `{ initialComplete }`는 새 세대를 기다립니다. 유효하지 않은 교체는 기존 View를 유지합니다. [수명 관리 가이드](../guides/manage-view-lifecycle/)에서 `update`로 State를 유지하는 경우와 `replace`로 다시 초기화하는 경우를 확인할 수 있습니다.

## whenRendered

작업에 맞는 완료 시점을 선택합니다.

| 대기할 값 | 완료 시점 |
| --- | --- |
| `await renderer.mount(options)` | View 구조가 준비되고 렌더러가 Svelte 루트를 연결했습니다. |
| `await mounted.initialComplete` | 마운트 세대의 실행 가능한 최초 Query와 DOM 반영이 끝났습니다. |
| `await applied.initialComplete` | 갱신 또는 교체 세대의 실행 가능한 최초 Query와 DOM 반영이 끝났습니다. |
| `await attachment.whenRendered()` | Svelte가 현재 렌더링 스냅샷을 DOM에 반영했습니다. Query 완료, 브라우저 페인트, 호스트 컴포넌트의 비동기 작업은 별도로 진행됩니다. |
| `runtime.createView` 또는 직접 호출한 View 연산에서 받은 Core `initialComplete` | 해당 세대의 Core 보고서가 준비됐습니다. Svelte 반영은 별도로 기다립니다. |

`whenRendered()`는 두 핸들과 [`ViewstemView` 인스턴스](../viewstem-view/#whenrendered)에서 사용할 수 있습니다. DOM 변경을 일으키는 Core 쓰기나 연산을 먼저 실행한 뒤 호출하세요. 폴백이 보이더라도 현재 렌더링에 실패가 남아 있으면 거절됩니다.
