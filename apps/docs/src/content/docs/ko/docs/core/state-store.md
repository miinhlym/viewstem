---
title: "StateStore"
description: "View 밖에서 타입이 있는 State를 소유하고 변경을 원자적으로 조정합니다."
sidebar:
  order: 13
---

View 밖에서 타입이 있는 State를 소유하고 변경을 원자적으로 조정합니다.

```ts
import { createStateStore } from '@viewstem/core';
import type { StateStore, StateScope, StateHandle, ValueSnapshot, StoreObservation, Clock } from '@viewstem/core';
```

## createStateStore()

scope가 없는 `StateStore`를 반환합니다. 호스트가 만든 Store는 `createRuntime({ registry, stateStore })`에 주입할 수 있으며 폐기도 호스트가 맡습니다.

## Store 메서드

| 메서드 | 인자 / 반환값 | 계약 |
|---|---|---|
| `createScope()` | `StateScope` 반환 | 독립된 이름 공간과 수명을 만듭니다. |
| `transaction(run)` | 동기 콜백; 해당 결과 반환 | 값·구조·scope 수명을 원자적으로 변경합니다. 예외가 나면 롤백합니다. Promise/thenable 반환은 금지합니다. |
| `writeBatch(changes)` | 읽기 전용 `[StateHandle, unknown][]`; void | 모든 대상과 값을 검증한 뒤 반영합니다. 같은 대상이 중복되면 배치를 거절합니다. |
| `subscribe(selector, listener)` | `null`, `StateAddress` 하나 또는 주소 배열; 구독 해제 함수 | 현재 관찰값을 즉시 전달하고 이후 해당 변경을 전달합니다. `null`은 전체 State입니다. |
| `registerReaction(owner, reaction)` | 발급된 `StateScope`; `{ watch: StateHandle[], target: StateHandle, value: unknown }`; 해제 함수 | 감시 값이 바뀌면 고정값을 설정합니다. watch는 비어 있으면 안 되며 중복 target reaction과 순환을 거절합니다. |
| `connectUrl(options)` | `UrlConnection` 반환 | Store당 활성 연결 하나입니다. [URL](../url/)에서 설명합니다. |
| `getDiagnostics()` | `readonly PublicError[]` | 관찰자·정리·연결에서 수집한 진단입니다. 호출자의 현재 연산이 직접 던진 예외와 구분하세요. |
| `dispose()` | void | URL, 모든 scope, 시계 구독, 관찰자를 정리합니다. |

reaction은 같은 변경 확정 과정에 포함됩니다. 호출자가 같은 배치에서 reaction의 target을 명시적으로 썼다면 해당 확정 과정에서는 명시적 쓰기가 우선합니다. listener에서 발생한 쓰기는 현재 전달 중인 관찰값을 바꾸지 않고 큐에 들어갑니다. listener 예외는 진단으로 기록합니다.

## StateScope

`scopeId`는 이름 공간을 식별합니다. 아래 이름은 모두 해당 scope 안의 이름입니다.

| 메서드 | 계약 |
|---|---|
| `registerState<T>(name, { schema, initial? })` | `StateHandle<T>`를 만듭니다. 이름 중복은 거절합니다. 호스트 선언은 인라인 `schema`와 선택적 네이티브 `initial`만 받으며 typeRef·Derived·표현식 평가는 지원하지 않습니다. |
| `replaceState<T>(name, declaration)` | 존재하는 셀을 교체합니다. 새 generation을 발급하고 이전 핸들을 무효화합니다. |
| `getState(name)` | 기존 `StateHandle<unknown>`을 반환하고 없으면 `REFERENCE_NOT_FOUND`입니다. |
| `removeState(name)` | 셀과 영향을 받는 reaction을 제거합니다. |
| `connectClock(target, clock)` | `clock.now()`를 즉시 쓰고 이후 epoch 밀리초 값을 구독합니다. 해제 함수를 반환하며 값은 대상 스키마가 허용하는 안전 정수여야 합니다. |
| `dispose()` | 이 scope의 셀·소유 reaction·시계 구독을 끝냅니다. 반복 호출할 수 있습니다. |

`Clock`은 `now(): number`와 `subscribe(listener: (epochMilliseconds: number) => void): () => void`를 제공합니다. 앱에 주입하는 명시적인 시간 값입니다. Query 타이머는 별도 [TimerClock](../runtime/)을 사용합니다.

## StateHandle

| 멤버 | 계약 |
|---|---|
| `address` | 읽기 전용 `{ scopeId: string, name: string }`인 `StateAddress`입니다. |
| `generation` | 현재 셀 세대를 식별하는 번호입니다. |
| `read()` | 읽기 전용 현재 값입니다. missing이면 `undefined`, pending/error이면 오류를 던집니다. |
| `getSnapshot()` | 판별 가능한 `ValueSnapshot<T>`입니다. 준비되지 않은 값을 다룰 때 사용합니다. |
| `write(value)` | 스키마로 검증하는 네이티브 값입니다. `undefined`와 Derived에 대한 쓰기는 금지합니다. |
| `reset()` | 초기 기준값으로 복원합니다. 초기값이 없었다면 missing으로 돌아가며 `undefined`를 쓰는 동작이 아닙니다. |

`ValueSnapshot<T>`는 `{ status: 'missing' }`, `{ status: 'pending' }`, `{ status: 'ready', value: DeepReadonly<T> }`, `{ status: 'error', error: PublicError }` 중 하나입니다. 네이티브 값은 격리하고 Set/Map 내부까지 스냅샷을 읽기 전용으로 제공합니다. 제거·교체·폐기된 핸들은 재사용할 수 없으므로 구조 교체 후 현재 핸들을 얻으세요.

## StoreObservation

`states`는 직렬화한 주소 키별 값 스냅샷이며 `values`는 같은 키의 준비된 값만 포함합니다. 키는 단순 State 이름이 아니라 `JSON.stringify([scopeId, name])`입니다. `changes`는 `{ kind: 'added' | 'updated' | 'removed' | 'replaced', target: StateAddress, generation: number }` 항목을 가집니다. 구독 직후의 즉시 전달에서는 changes가 비어 있습니다. 삭제된 값은 없어도 삭제 기록은 changes에 남습니다.

실행 예제는 [State 공유와 URL 동기화](../guides/state-and-url/)에 있습니다. 리소스의 State·Derived 선언은 [DSL State와 포트](../../dsl/state-and-ports/)에서 설명합니다.
