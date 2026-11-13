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
| `updateResource(definition)` | `RegisteredResource`; 현재 Registry 반환 | 교체할 정의와 의존 정의를 검증한 뒤 반영합니다. 코드 Action의 등록된 입력·출력 계약을 보존합니다. |

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

TypeScript는 포트 선언에서 입력을, 결과 스키마에서 출력을 추론합니다. 핸들러에서 항상 사용하는 입력은 `required: true`로 선언하세요. `default`가 있어도 선택 포트는 `inputs`에 없을 수 있습니다. 기본값은 호출에서 키를 생략했을 때 적용합니다. 선택 입력에 연결한 표현식의 값이 missing이면 해당 키 없이 핸들러를 호출합니다.

참조 `Type`이나 Query 결과처럼 앱 타입이 필요한 경우 `registerAction<Inputs, Output>(definition, implementation)`를 사용하세요. `Inputs`의 필수 키마다 포트 종류를 맞추고 `required: true`를 설정해야 합니다. 포트에는 고정된 이름을 사용하고 동적 키는 Value 포트 안에 넣으세요. 값 타입을 직접 지정한다면 실제 스키마와 일치시켜야 합니다. 런타임 검증에는 등록된 스키마를 사용합니다.

| 공개 타입 | 계약 |
|---|---|
| `CodeActionDefinition<I, O = void>` | `kind: 'Action'`과 `CodeActionSpec<I, O>`를 가진 리소스 외피입니다. |
| `CodeActionSpec<I, O>` | `I`에 필수 키가 있으면 포트 맵을 선언하고 해당 포트에 `required: true`를 설정합니다. 값을 반환하는 경우 출력에 `schema` 또는 `typeRef`를 선언합니다. |
| `ActionHandler<I, O = void>` | `ActionContext<I>`를 받아 `O` 또는 `Promise<O>`, void 계약이면 `void`/`Promise<void>`를 반환합니다. |
| `ActionContext<I>` | 읽기 전용 `inputs`, 취소 `signal: AbortSignal`, `invokeAction(request): Promise<unknown>`를 제공합니다. |
| `ChildActionRequest` | `actionRef`와 인라인 `action` 중 하나, 선택적인 네이티브 `inputs`를 받습니다. `owner`, `id`는 받지 않고 부모 수명·재귀 문맥을 상속합니다. |

State·Query 포트는 발급된 핸들을 받습니다. 일반 값 입력은 격리된 깊은 읽기 전용 값입니다. 하위 호출도 권한 검사를 수행합니다. 반환값은 스키마로 검증하며 부모 종료·취소 시 미완료 하위 호출을 취소합니다. 이미 완료된 효과는 되돌리지 않습니다.

전체 실행 예제는 [HTTP와 코드 Action 연결하기](../guides/http-and-actions/)에 있습니다. 리소스 외피와 선언형 Action은 [DSL 리소스](../../dsl/resources/), [DSL Action](../../dsl/actions/)에서 설명합니다.

### 코드 Action 갱신하기

표시 이름은 Action ID를 유지한 채 바꿀 수 있습니다. 포트, 포트 순서와 기본값, 해석된 입출력 스키마를 바꾸면 `TYPE_CONTRACT_MISMATCH`가 발생합니다. 코드 Action에서 쓰는 `Type`을 갱신할 때도 같은 규칙을 적용합니다. `error.resource`로 영향받는 Action을, `error.location`으로 변경 위치를 확인하세요.

계약을 바꾸려면 새 Action ID에 핸들러를 함께 등록하세요. 공유 Type의 스키마를 바꿔야 하면 새 Type ID를 먼저 등록합니다. 호출 입력과 `actionRef`를 바꾼 다음 새 View를 만들거나 `view.replace()`로 적용하세요. 이전 ID를 직접 호출하는 코드 Action도 바뀐 구현을 새 ID로 등록하고 그 참조를 옮겨야 합니다.
