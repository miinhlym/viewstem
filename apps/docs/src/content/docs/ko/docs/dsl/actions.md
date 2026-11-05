---
title: Action
description: 선언형 단계와 출력, 이벤트 연결, 코드형 Action 정의를 설명합니다.
sidebar:
  order: 7
---

## ActionSpec

| 필드 | 계약 |
| --- | --- |
| `ports` | 선택적 Value, State, Query 포트 맵. |
| `steps` | 실행 순서대로 나열한 필수 단계 배열. 빈 배열도 가능합니다. |
| `output` | 선택적 객체. 타입 계약 필드(`schema` 또는 `typeRef`) 하나와 필수 `value` 표현식을 받습니다. |

호출 시 Value 입력은 스냅샷으로, State와 Query는 연결된 대상으로 확보합니다. 입력 준비가 실패하면 어떤 단계도 실행하지 않습니다. 단계나 출력 검증이 실패하면 실행을 중단합니다. 앞서 완료한 State 쓰기와 외부 효과는 유지됩니다. 반환값이 없는 Action은 `output`을 생략합니다. 타입 계약이 허용하면 null과 false도 반환값입니다.

## 단계

각 `Step`에는 `kind`가 필요하며 비어 있지 않은 로컬 `id`를 붙일 수 있습니다. ID는 단계 배열 안에서 유일해야 합니다. `/steps/<id>`는 앞선 Query, Variable 또는 출력이 있는 Action 단계의 실제 결과를 읽습니다. `If`의 분기는 완료된 바깥 결과를 읽을 수 있고 분기 내부 결과는 그 범위에서만 쓸 수 있습니다. 미래 단계, 없는 단계, 반환값이 없는 단계의 결과는 읽을 수 없습니다.

| 종류 | 필드와 결과 |
| --- | --- |
| `Query` | `queryRef`와 인라인 `spec` 중 하나, 선택적 `inputs`. 명시 실행의 최종 변환 결과를 반환합니다. |
| `Variable` | `variableRef`와 인라인 `spec` 중 하나, 선택적 `inputs`. CEL 결과를 반환합니다. |
| `Action` | `actionRef`와 인라인 `spec` 중 하나, 선택적 `inputs`. 하위 Action의 State 또는 Query 포트는 같은 종류의 상위 포트를 통해 연결합니다. 하위 Action이 출력을 선언하면 그 값이 결과입니다. |
| `SetState` | 필수 State `target`과 `value`. 검증을 거쳐 대상 값 전체를 교체합니다. |
| `RefreshQuery` | 필수 Query `target`. 해당 Query 사용 인스턴스의 현재 입력으로 새 실행을 요청하고 완료를 기다립니다. |
| `If` | 필수 엄격한 불리언 `condition`과 `then` 단계 배열, 선택적 `else` 단계 배열. 선택한 분기만 실행합니다. |
| `Assert` | 필수 엄격한 불리언 `condition`과 선택적 `message` 표현식. false이면 메시지를 문자열로 평가하고 `ASSERTION_FAILED`로 중단합니다. 기본 메시지는 `Assertion failed`입니다. |

대상은 정확히 `{"@path":"/ports/<이름>"}` 형태의 객체입니다. SetState는 State 포트를, RefreshQuery는 Query 포트를 지정해야 합니다. `Assert`가 실패할 때 메시지가 문자열이 아니면 타입 오류입니다. `SetState`, `RefreshQuery`, `If`, `Assert`는 단계 결과를 만들지 않습니다.

다음 Action은 필수 문자열을 받아 빈 문자열을 거절하고 서식을 적용한 결과를 반환합니다.

```json title="label-action.json"
{
  "kind": "Action",
  "id": "project-label",
  "spec": {
    "ports": { "project": { "kind": "Value", "required": true, "schema": { "type": "string" } } },
    "steps": [
      {
        "kind": "Variable",
        "id": "hasName",
        "spec": {
          "ports": { "name": { "kind": "Value", "required": true, "schema": { "type": "string" } } },
          "expression": "size(name) > 0"
        },
        "inputs": { "name": { "@path": "/ports/project" } }
      },
      { "kind": "Assert", "condition": { "@path": "/steps/hasName" }, "message": "Project is required" }
    ],
    "output": {
      "schema": { "type": "string" },
      "value": { "@call": "concat", "args": ["Project ", { "@path": "/ports/project" }] }
    }
  }
}
```

## ActionCall

노드의 `on.<이벤트>`에 두는 ActionCall은 `actionRef` 또는 인라인 `action` 중 하나와 선택적 `inputs`, `id`를 받습니다. 입력 표현식은 `/event`에서 이벤트 payload를 읽을 수 있습니다. Action 내부는 자체 포트와 완료된 단계만 읽습니다. `emit`과 `payload`를 쓰는 연결은 Component 이벤트를 전달합니다. [슬롯과 이벤트](/ko/docs/dsl/view-and-component/#슬롯과-이벤트)를 참고하세요.

ActionCall의 `id`를 지정하면 작성 인스턴스 내 활성 호출 연결에서 유일해야 합니다. `/actions/<id>`에서 ActionSnapshot을 읽습니다.

| 필드 | 의미 |
| --- | --- |
| `status` | `idle`, `running`, `success`, `error` 중 하나. |
| `running` | 호출이 진행 중이면 true. |
| `data` | 출력이 있는 성공이면 반환값, 그 외에는 null. 새 실행이 시작되면 초기화합니다. |
| `error` | 실패하면 공개 오류, 그 외에는 null. 새 실행이 시작되면 초기화합니다. |

한 연결에서 호출이 진행 중이면 관찰 ID가 없어도 끝날 때까지 추가 호출을 무시합니다. 연결이나 소유자를 제거하면 진행 중 작업을 취소하고 늦은 결과를 버립니다. 연결을 다시 만들면 새 수명이 시작됩니다. [이벤트와 Action](/ko/docs/concepts/events-and-actions/)을 참고하세요.

## 코드형 Action 정의

`CodeActionDefinition`은 같은 Action 외피와 `CodeActionSpec`을 사용합니다. `ports`와 `output`은 선택적이고 `output`에는 타입만 선언합니다. 본문에 `steps`나 `output.value`는 두지 않습니다. 등록한 핸들러가 값을 반환하며, 반환값 없는 정의의 핸들러는 undefined를 반환합니다. 코드형 Action은 `actionRef`로 호출합니다. 구현을 등록하는 방법은 [Registry](/ko/docs/core/registry/), 호스트의 명시 호출과 코드 핸들러 문맥은 [Runtime API](/ko/docs/core/runtime/)를 참고하세요.
