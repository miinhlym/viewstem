---
title: "Registry"
description: "View를 만들기 전에 재사용 정의와 호스트 구현을 등록하고 검증합니다."
sidebar:
  order: 10
---

View를 만들기 전에 재사용 정의와 호스트 구현을 등록하고 검증합니다.

```ts
import { createRegistry } from '@viewstem/core';
import type { Registry, AnyResource, ComponentContract, CodeActionDefinition } from '@viewstem/core';
```

## createRegistry

`createRegistry(options?) → Registry`는 `AnyResource[]` 또는 `{ resources?: AnyResource[], componentContracts?: ComponentContract[], functions?: CelFunction[] }`를 받습니다. 두 목록의 기본값은 빈 배열입니다. 리소스는 JSON 선언이며 사용자 CEL 함수는 신뢰하는 동기 함수로 별도 등록합니다. 리소스는 `(kind, id)` 쌍으로 식별하므로 종류가 다르면 같은 ID를 사용할 수 있습니다. ID는 비어 있지 않은 문자열이어야 합니다.

## 등록 메서드

| 메서드 | 인자와 반환값 | 동작 |
|---|---|---|
| `registerResources(resources)` | 읽기 전용 `AnyResource[]`; 현재 Registry 반환 | 같은 배치 안의 참조를 포함해 원자적으로 검증·등록합니다. 식별자가 중복되면 배치 전체를 거절합니다. |
| `registerComponentContract(contract)` | `ComponentContract`; 현재 Registry 반환 | 코드 Component의 포트·슬롯·이벤트 계약을 등록합니다. 화면 구현을 제공하거나 `render` 트리를 받는 API가 아닙니다. |
| `registerComponentContracts(contracts)` | 읽기 전용 `ComponentContract[]`; 현재 Registry 반환 | 원자적인 배치 등록입니다. 기존 식별자를 덮어쓰지 않습니다. |
| `registerAction(definition, implementation)` | 코드 Action 계약과 `ActionHandler`; 현재 Registry 반환 | Action ID에 호스트 함수를 등록합니다. 아래에서 설명합니다. |
| `updateResource(definition)` | `RegisteredResource`; 현재 Registry 반환 | 기존 정의를 교체하고 의존 정의까지 검증한 뒤 반영합니다. 등록된 구현 함수를 교체하지는 않습니다. |

잘못된 필드·미지원 스키마·유효하지 않은 참조는 등록을 거절합니다. 오류는 `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_CONTRACT_MISMATCH` 등의 공개 진단입니다. `message`를 파싱하지 말고 `code`를 확인하세요. 갱신 실패 시 기존 레지스트리를 유지합니다. 입력 정의는 복사하므로 등록 후 원본 객체를 변경해도 영향을 주지 않습니다.

## 조회와 추출

| 메서드 | 반환값 | 의미 |
|---|---|---|
| `get(kind, id)` | 깊은 읽기 전용 등록 리소스 | 없으면 `REFERENCE_NOT_FOUND`를 던집니다. |
| `list(filter?)` | 복사된 `RegisteredResource[]` | 생략하면 전체, 종류 문자열이면 해당 종류, 부분 `{ kind, id, name }`이면 필드 일치, 함수이면 읽기 전용 리소스를 인자로 판정합니다. |
| `exportResource(kind, id)` | 분리된 리소스 선언 | 편집·직렬화에 사용할 수 있습니다. 구현 함수나 실행 중 State는 포함하지 않습니다. |
| `isCode(kind, id)` | `boolean` | 코드 Component 또는 Action으로 등록된 식별자인지 확인합니다. |

실행 중 View는 현재 수명에 주입된 정의를 사용합니다. 공용 정의를 등록·교체해도 기존 View에 자동으로 바뀐 정의를 주입하지 않습니다. 새 View나 [View.replace](../view/#replace)로 최신 레지스트리를 주입하세요. 현재 View 자체 정의만 바꾸려면 `view.updateDefinition()`를 사용합니다.

<a id="code-actions"></a>
## 코드 Action

```ts
registry.registerAction({
  kind: 'Action', id: 'greet',
  spec: {
    ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
    output: { schema: { type: 'string' } },
  },
}, ({ inputs, signal }) => `Hello, ${inputs.name}`);
```

첫 오버로드는 리터럴 포트 계약에서 입력을, 결과 스키마에서 출력을 추론합니다. 앱 타입을 직접 지정하려면 `registerAction<Inputs, Output>(definition, implementation)`를 사용하세요. `typeRef`만으로 런타임 레지스트리의 타입을 TypeScript가 추론하지는 못하므로 필요한 곳에 타입을 명시합니다. 타입 추론이 런타임 검증을 대체하지는 않습니다.

| 공개 타입 | 계약 |
|---|---|
| `CodeActionDefinition<I, O = void>` | `kind: 'Action'`과 `CodeActionSpec<I, O>`를 가진 리소스 외피입니다. |
| `CodeActionSpec<I, O>` | `I`에서 결정한 선택적 포트를 가집니다. `steps`는 금지합니다. void가 아닌 결과는 `value` 없이 `schema` 또는 `typeRef`를 선언하고 void는 `output`을 생략합니다. |
| `ActionHandler<I, O = void>` | `ActionContext<I>`를 받아 `O` 또는 `Promise<O>`, void 계약이면 `void`/`Promise<void>`를 반환합니다. |
| `ActionContext<I>` | 읽기 전용 `inputs`, 취소 `signal: AbortSignal`, `invokeAction(request): Promise<unknown>`를 제공합니다. |
| `ChildActionRequest` | `actionRef`와 인라인 `action` 중 하나, 선택적인 네이티브 `inputs`를 받습니다. `owner`, `id`는 받지 않고 부모 수명·재귀 문맥을 상속합니다. |

State·Query 포트는 발급된 핸들을 받습니다. 일반 값 입력은 격리된 깊은 읽기 전용 값입니다. 하위 호출도 권한 검사를 수행합니다. 반환값은 스키마로 검증하며 부모 종료·취소 시 미완료 하위 호출을 취소합니다. 이미 완료된 효과는 되돌리지 않습니다.

전체 실행 예제는 [HTTP와 코드 Action 연결하기](../guides/http-and-actions/)에 있습니다. 리소스 외피와 선언형 Action은 [DSL 리소스](../../dsl/resources/), [DSL Action](../../dsl/actions/)에서 설명합니다.
