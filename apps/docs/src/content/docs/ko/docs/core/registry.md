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
| `registerResourceSet(set)` | `ResourceSet`, 현재 Registry 반환 | 셋과 의존 셋의 정의 및 코드 연결을 원자적으로 등록합니다. |
| `registerResources(resources)` | 읽기 전용 `AnyResource[]`; 현재 Registry 반환 | 같은 배치 안의 참조를 포함해 원자적으로 검증·등록합니다. 식별자가 중복되면 배치 전체를 거절합니다. |
| `registerComponentContract(contract)` | `ComponentContract`; 현재 Registry 반환 | 코드 Component의 포트·슬롯·이벤트 계약을 등록합니다. 화면 구현을 제공하거나 `render` 트리를 받는 API가 아닙니다. |
| `registerComponentContracts(contracts)` | 읽기 전용 `ComponentContract[]`; 현재 Registry 반환 | 원자적인 배치 등록입니다. 기존 식별자를 덮어쓰지 않습니다. |
| `registerAction(entry)` | 코드 Action 엔트리, Registry 반환 | 입력·출력과 필수 호스트 기능을 함께 등록합니다. |
| `registerAction(definition, implementation)` | 코드 Action 계약과 `ActionHandler`; 현재 Registry 반환 | Action ID에 호스트 함수를 등록합니다. 아래에서 설명합니다. |
| `updateResource(definition)` | `RegisteredResource`; 현재 Registry 반환 | 교체할 정의와 의존 정의를 검증한 뒤 반영합니다. 코드 Action의 등록된 입력·출력 계약을 보존합니다. 코드 Component의 바인딩을 보존하는 경우 포트·슬롯·이벤트 계약도 유지합니다. |
| `replaceResource(entry)` | `{ resource }`, `{ action }`, `{ component }` 중 하나, 현재 Registry 반환 | 기존 정의나 코드 연결을 명시적으로 교체합니다. 코드 Action의 입력·출력과 필수 호스트 기능 계약을 보존합니다. |

잘못된 필드·미지원 스키마·유효하지 않은 참조는 등록을 거절합니다. 오류는 `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_CONTRACT_MISMATCH` 등의 공개 진단입니다. `message`를 파싱하지 말고 `code`를 확인하세요. 갱신 실패 시 기존 레지스트리를 유지합니다. 입력 정의는 복사하므로 등록 후 원본 객체를 변경해도 영향을 주지 않습니다.

## 조회와 추출

| 메서드 | 반환값 | 의미 |
|---|---|---|
| `get(kind, id)` | 깊은 읽기 전용 등록 리소스 | 없으면 `REFERENCE_NOT_FOUND`를 던집니다. |
| `list(filter?)` | 복사된 `RegisteredResource[]` | 생략하면 전체, 종류 문자열이면 해당 종류, 부분 `{ kind, id, name }`이면 필드 일치, 함수이면 읽기 전용 리소스를 인자로 판정합니다. |
| `exportResource(kind, id)` | 분리된 리소스 선언 | 편집·직렬화에 사용할 수 있습니다. 구현 함수나 실행 중 State는 포함하지 않습니다. |
| `isCode(kind, id)` | `boolean` | 코드 Component 또는 Action으로 등록된 식별자인지 확인합니다. |

`@viewstem/core`의 `defineResourceSet({ id, version, dependencies?, resources?, actions?, components? })`으로 셋을 만듭니다. 의존 셋은 앱이 미리 가져옵니다. 같은 셋 객체를 다시 등록하면 기존 등록을 재사용합니다. 객체가 다르고 셋 ID가 같으면 버전 문자열이 같아도 충돌합니다.

열린 View는 현재 리소스 구성을 유지합니다. 등록한 셋을 열린 View에 추가하려면 [`applyResourceSets()`](../view/#applyresourcesets)를 사용합니다. Registry에 게시한 교체를 반영하려면 새 View를 만들거나 [`replace()`](../view/#replace)를 사용합니다.

<a id="code-actions"></a>
독립 셋 패키지는 `@viewstem/core`를 peer dependency로 선언하고 번들에서 외부화해 앱과 같은 Core 모듈 인스턴스로 셋을 정의하세요. 코드 Component의 계약과 바인딩을 함께 바꿀 때는 `replaceResource({ component })`를 사용합니다. 계약만 등록한 기존 ID에 처음 바인딩을 붙일 때도 이 경로를 사용합니다.

## 코드 Action

`greet.ts`에서 계약과 첫 구현을 선언합니다.

```ts
import { defineCodeAction } from '@viewstem/core';

export const greet = defineCodeAction({
  definition: {
    kind: 'Action', id: 'greet',
    spec: {
      ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
      output: { schema: { type: 'string' } },
    },
  },
});
export const greetAction = greet.implement(({ inputs }) => `Hello, ${inputs.name}`);
```

셋을 구성하는 파일에서 내보낸 엔트리를 가져와 등록합니다.

```ts
import { createRegistry, defineResourceSet } from '@viewstem/core';
import { greetAction } from './greet.js';

const registry = createRegistry();
registry.registerResourceSet(defineResourceSet({
  id: 'greetings', version: '1', actions: [greetAction],
}));
```

TypeScript는 포트 선언에서 입력을, 결과 스키마에서 출력을 추론합니다. 핸들러에서 항상 사용하는 입력은 `required: true`로 선언하세요. `default`가 있어도 선택 포트는 `inputs`에 없을 수 있습니다. 기본값은 호출에서 키를 생략했을 때 적용합니다. 선택 입력에 연결한 표현식의 값이 missing이면 해당 키 없이 핸들러를 호출합니다.

참조 `Type`이나 Query 결과처럼 타입을 명시해야 할 때는 `defineCodeAction<Inputs, Output>({ definition, requires? })`을 사용합니다. 필수 입력마다 종류가 맞는 포트에 `required: true`를 지정합니다. 명시한 타입은 런타임 검증에 쓰이는 등록 스키마와 맞춰야 합니다. 직접 등록할 때는 `registerAction<Inputs, Output>(definition, implementation)`을 사용합니다. 동적 키는 Value 포트 안에 넣습니다.

| 공개 타입 | 계약 |
|---|---|
| `CodeActionDefinition<I, O = void>` | `kind: 'Action'`과 `CodeActionSpec<I, O>`를 가진 리소스 외피입니다. |
| `CodeActionSpec<I, O>` | `I`에 필수 키가 있으면 포트 맵을 선언하고 해당 포트에 `required: true`를 설정합니다. 값을 반환하는 경우 출력에 `schema` 또는 `typeRef`를 선언합니다. |
| `ActionHandler<I, O = void>` | `ActionContext<I>`를 받아 `O` 또는 `Promise<O>`, void 계약이면 `void`/`Promise<void>`를 반환합니다. |
| `ActionContext<I>` | 읽기 전용 `inputs`, 취소 `signal: AbortSignal`, `invokeAction(request): Promise<unknown>`, 연결이 선언한 호스트 기능 `capabilities`를 제공합니다. |
| `ChildActionRequest` | `actionRef`와 인라인 `action` 중 하나, 선택적인 네이티브 `inputs`를 받습니다. `owner`, `id`는 받지 않고 부모 수명·재귀 문맥을 상속합니다. |

State·Query 포트는 발급된 핸들을 받습니다. 일반 값 입력은 격리된 깊은 읽기 전용 값입니다. 하위 호출도 권한 검사를 수행합니다. 반환값은 스키마로 검증하며 부모 종료·취소 시 미완료 하위 호출을 취소합니다. 이미 완료된 효과는 되돌리지 않습니다.

전체 실행 예제는 [HTTP와 코드 Action 연결하기](../guides/http-and-actions/)에 있습니다. 리소스 외피와 선언형 Action은 [DSL 리소스](../../dsl/resources/), [DSL Action](../../dsl/actions/)에서 설명합니다.

독립 Action 하나를 등록하려면 `registry.registerAction(greetAction)`으로 같은 엔트리를 전달합니다. 기존 두 인자 등록은 추가 호스트 기능을 요구하지 않는 함수에 사용할 수 있습니다.

### 코드 Action 갱신하기

표시 이름은 Action ID를 유지한 채 바꿀 수 있습니다. `updateResource()`는 먼저 갱신 후보와 그 후보에 의존하는 리소스를 검증합니다. 검증을 통과한 뒤에도 포트, 포트 순서와 기본값, 해석된 입출력 스키마가 달라지면 `TYPE_CONTRACT_MISMATCH`로 거절합니다. 코드 Action에서 쓰는 `Type`을 갱신할 때도 같은 규칙을 적용합니다. 이 오류의 `error.resource`로 영향받는 Action을, `error.location`으로 변경 위치를 확인하세요.

같은 계약을 가져와 `.implement()`에 새 함수를 전달하면 입력·출력과 필수 호스트 기능을 함께 재사용합니다.

```ts
import { greet } from './greet.js';

registry.replaceResource({
  action: greet.implement(({ inputs }) => `Welcome, ${inputs.name}`),
});
```

진행 중인 호출은 기존 함수로 계속 실행합니다. 새 View와 새 Runtime 직접 호출은 새 함수를 사용하고, 열린 View는 `view.replace()` 뒤에 새 함수를 사용합니다.

계약을 바꾸려면 새 Action ID에 핸들러를 함께 등록하세요. 공유 Type의 스키마를 바꿔야 하면 새 Type ID를 먼저 등록합니다. 호출 입력과 `actionRef`를 바꾼 다음 새 View를 만들거나 `view.replace()`로 적용하세요.
