---
title: State와 포트
description: 소유 State, Derived, Variable 계산, reaction 및 공개 입력의 선언을 설명합니다.
sidebar:
  order: 4
---

## State 선언

`ResourceStateDeclaration`은 View나 Component의 `states` 맵 항목입니다. 현재 값은 `/states/<이름>`에서 읽습니다. 각 항목에 `schema`와 `typeRef` 중 하나가 필요합니다.

| `kind` | 추가 필드 | 동작 |
| --- | --- | --- |
| `State` | 선택적 `initial` 표현식. | 해당 인스턴스가 소유하는 쓰기 가능한 셀. 초기 표현식을 생략하면 누락 상태로 시작합니다. |
| `Derived` | `variableRef` 또는 인라인 `variable` 중 하나와 선택적 `inputs`. | 읽기 전용 계산 셀. 입력이 바뀌면 Variable을 다시 계산하고 Derived 계약으로 결과를 검증합니다. |

현재 core는 `initial`과 Derived 입력에서 `/ports`, `/states`를 받습니다. 런타임은 JSON 키 순서와 관계없이 로컬 State의 의존 순서를 정하고 순환을 거절합니다. State의 초기값은 수명 중 한 번 확정됩니다. 초기값이 준비되기 전에 쓴 현재 값은 뒤늦게 도착한 초기값으로 덮어쓰지 않습니다. 리셋은 확정된 초기 스냅샷을 복원합니다. [StateStore](/ko/docs/core/state-store/)를 참고하세요.

## VariableSpec

Variable은 비어 있지 않은 CEL 문자열 `expression`을 필수로 받고 선택적 `ports` 맵에 Value 포트를 둡니다. CEL 식에서는 `size(items)`처럼 포트 이름을 직접 사용합니다. Derived 선언 또는 Action의 Variable 단계에서 Variable을 호출할 수 있습니다. 시계, 날짜 등 변하는 입력은 포트를 통해 전달합니다. 지원하는 함수와 한도는 [CEL API](/ko/docs/core/cel/)에서 확인할 수 있습니다.

다음 View 본문은 **Selected**를 표시합니다. `items` State를 빈 배열로 바꾸면 조건에 따라 배지가 제거됩니다.

```json title="derived-view.json"
{
  "states": {
    "hasItems": {
      "kind": "Derived",
      "schema": { "type": "boolean" },
      "variable": {
        "ports": {
          "items": { "kind": "Value", "required": true, "schema": { "type": "array" } }
        },
        "expression": "size(items) > 0"
      },
      "inputs": { "items": { "@path": "/states/items" } }
    },
    "items": { "kind": "State", "schema": { "type": "array" }, "initial": ["A"] }
  },
  "render": {
    "id": "selection",
    "componentRef": "shadcn.Badge",
    "when": { "@path": "/states/hasItems" },
    "inputs": { "text": "Selected" }
  }
}
```

## 포트

| 포트 | 선언 | 입력과 읽기 동작 |
| --- | --- | --- |
| `Value` | `kind: "Value"`와 `schema` 또는 `typeRef` 중 하나. `required`가 없거나 false이면 선택적 `default`. | 리터럴 또는 평가한 값을 받습니다. `/ports/<이름>`에서 값을 읽습니다. |
| `State` | `kind: "State"`와 `schema` 또는 `typeRef` 중 하나. | `/states/<이름>` 또는 State 포트인 `/ports/<이름>` 경로로 기존의 쓰기 가능한 셀을 연결합니다. 값을 읽는 문맥에서는 셀의 값을 얻습니다. |
| `Query` | `kind: "Query"`와 선택적 `required`. | `/queries/<이름>` 또는 Query 포트인 `/ports/<이름>` 경로로 Query 사용 인스턴스를 연결합니다. `/ports/<이름>/data`와 같은 필드를 읽습니다. |

세 포트 모두 `required`는 불리언이며 기본값은 false입니다. State와 Query 포트에는 기본값이 없고, Query 포트에는 스키마를 지정할 수 없습니다. Component, View, Action은 세 종류를 모두 받습니다. Query와 Variable은 Value만 받으며 Datasource와 Type은 포트를 선언하지 않습니다.

Value의 기본값은 등록 시 검증하며 입력 키를 생략한 경우에만 적용합니다. 명시적 null은 값으로 검증합니다. 입력 표현식이 누락, 대기, 실패를 반환하면 해당 상태를 유지합니다. 필수 입력 키가 없거나 선언하지 않은 입력을 전달하면 구조 검증에서 실패합니다. 자동 소비자는 필수 값이 준비될 때까지 대기할 수 있습니다. 명시적 호출에서 필수 값이 준비되지 않으면 `INPUT_NOT_READY`로 실패합니다.

State 포트는 원본 셀과 참조를 해석한 스키마 계약을 비교합니다. 설명용 항목과 의미 없는 순서 차이는 무시하고, 제약이 맞지 않으면 `TYPE_CONTRACT_MISMATCH`로 거절합니다. 현재 값이 정수여도 `number` 셀을 `integer` State 포트에 연결할 수는 없습니다. 호환되는 State나 Query 포트를 연결하면 원래 대상을 공유합니다.

## Reaction

`Reaction`에는 아래 필드가 모두 필요합니다. 경로는 `/states/<이름>` 또는 `/ports/<이름>`으로 항목 전체를 지정합니다.

| 필드 | 계약 |
| --- | --- |
| `watch` | 로컬 State, 로컬 Derived, 연결된 State 포트를 가리키는 비어 있지 않은 직접 경로 배열. |
| `target` | 쓰기 가능한 로컬 State나 연결된 State 포트를 가리키는 직접 경로 하나. |
| `value` | 대상 스키마로 검증할 고정 JSON 값. 키는 작성한 그대로 사용합니다. |

초기화가 끝난 뒤 감시하는 값이 바뀌면 reaction이 동작합니다. 저장소는 reaction 대상 중복과 Derived를 거치는 경우를 포함한 의존성 순환을 거절합니다. 같은 트랜잭션에서 대상에 명시적으로 쓴 값이 있으면 그 값이 우선합니다. reaction의 수명은 소유 View나 Component를 따릅니다. [State](/ko/docs/concepts/state/)와 [파생 값](/ko/docs/concepts/derived-values/)을 참고하세요.
