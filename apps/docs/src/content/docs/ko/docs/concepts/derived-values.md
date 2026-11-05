---
title: 계산된 값
description: Derived와 Variable로 입력에 따라 바뀌는 값을 계산합니다.
---

제목 표시 문구, 합계, 폼의 유효 여부처럼 다른 값으로 계산할 수 있는 값이 있습니다. **Variable**은 순수 계산을 정의하고, **Derived**는 그 계산을 View나 Component 안에서 반응형 읽기 전용 값으로 사용합니다.

## 계산 선언하기

아래 View는 현재 제목 뒤에 느낌표를 붙입니다.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    },
    "label": {
      "kind": "Derived",
      "schema": {
        "type": "string"
      },
      "variable": {
        "ports": {
          "title": {
            "kind": "Value",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        },
        "expression": "title + \"!\""
      },
      "inputs": {
        "title": {
          "@path": "/states/title"
        }
      }
    }
  },
  "render": {
    "id": "label",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/states/label"
      }
    }
  }
}
```


처음에는 배지에 **Draft!**가 표시됩니다. `title`에 **Saved**를 쓰면 `label`을 따로 변경하지 않아도 **Saved!**가 표시됩니다.

## 계산에 필요한 값 연결하기

`variable` 옆의 `inputs`는 View 범위에서 `/states/title`을 읽어 Variable의 `title` 포트에 전달합니다. `expression` 안의 CEL 이름 `title`은 이 포트를 가리킵니다. Variable이 바깥 View의 State를 암묵적으로 읽는 것은 아닙니다.

CEL 표현식은 `size(title) > 5`처럼 선언된 입력에 지원하는 연산자와 함수를 적용합니다. 임의의 JavaScript 실행, 네트워크 요청, State 쓰기는 수행하지 않습니다.

## State와 Derived 선택하기

| 필요한 동작 | 사용할 선언 |
|---|---|
| 사용자나 Action이 변경하는 값 보관 | `State` |
| 계산 결과를 입력과 계속 동기화 | `Derived` |
| 같은 계산을 여러 곳에서 재사용 | 등록한 `Variable`을 `variableRef`로 참조 |

Derived도 `/states/이름`으로 읽지만 `SetState`의 쓰기 대상이 될 수 없습니다. 입력이 준비되지 않았다면 계산은 대기하고, 평가가 실패했다면 임의의 값으로 대체하지 않고 오류를 드러냅니다.

[Derived 예제](../../../examples/derived/)에서 제목 변경에 따라 계산 결과가 바뀌는 것을 확인해 보세요.

CEL은 값을 계산하는 표현식 언어입니다. [VariableSpec](../../dsl/state-and-ports/#variablespec)에서 입력·계산 정의를, [CEL 레퍼런스](../../core/cel/)에서 지원 문법과 함수를 확인하세요.
