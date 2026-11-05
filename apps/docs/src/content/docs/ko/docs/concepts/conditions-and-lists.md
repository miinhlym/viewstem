---
title: 조건과 목록
description: when과 고유 키가 있는 repeat로 표시할 노드를 정합니다.
---

화면에서는 조건에 맞는 영역만 표시하거나 여러 항목에 같은 Component를 적용해야 할 때가 있습니다. **when**은 노드의 존재 여부를, **repeat**는 항목별 인스턴스 생성을 제어합니다.

## 조건에 따라 노드 표시하기

아래는 boolean State인 `states.enabled`를 가진 View의 render 노드입니다. State가 `true`일 때만 존재합니다.


```json
{
  "id": "details",
  "componentRef": "shadcn.Badge",
  "inputs": {
    "text": "Details"
  },
  "when": {
    "@path": "/states/enabled"
  }
}
```


`when`은 boolean을 받습니다. `"true"` 같은 문자열은 boolean 조건이 아닙니다. `when`을 생략하면 조건 없이 노드를 사용합니다.

## 목록 반복하기

아래 View는 `repeat`와 `when`을 함께 사용합니다. Billing의 `visible`이 `false`이므로 **Onboarding** 배지만 표시됩니다.


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "project",
          "componentRef": "shadcn.Badge",
          "repeat": {
            "items": [
              {
                "id": "onboarding",
                "name": "Onboarding",
                "visible": true
              },
              {
                "id": "billing",
                "name": "Billing",
                "visible": false
              }
            ],
            "as": "project",
            "key": {
              "@path": "/repeat/project/id"
            }
          },
          "when": {
            "@path": "/repeat/project/visible"
          },
          "inputs": {
            "text": {
              "@path": "/repeat/project/name"
            }
          }
        }
      ]
    }
  }
}
```


`items`는 반복할 컬렉션입니다. `as: "project"`는 각 항목을 `/repeat/project`로 읽게 합니다. 런타임은 항목을 확장한 뒤 각 항목의 `when`을 평가하므로 조건에서 해당 항목을 읽을 수 있습니다. 반복 노드의 선언 ID는 `project` 하나입니다. `repeat`는 슬롯 배열 안의 노드에 사용하며, 단일 `render` 루트에는 사용할 수 없습니다.

## 안정적인 key 정하기

`key`는 목록이 바뀌어도 같은 항목을 식별하기 위한 값입니다. 레코드 ID처럼 고유하고 안정적인 문자열 또는 유한한 숫자를 사용하세요. 순서가 바뀌어도 key가 같으면 해당 인스턴스와 로컬 State를 유지할 수 있습니다. 중복되거나 값이 없는 key는 오류입니다.

## 노드 제거와 수명

`when`이 `false`가 되거나 반복 항목이 제거되면 인스턴스가 폐기됩니다. 로컬 State와 그 인스턴스가 소유한 진행 중 Action에도 적용됩니다. 다시 표시할 때는 새 인스턴스를 만듭니다. 실행 인스턴스를 유지한 채 DOM 요소만 시각적으로 숨기는 것과 다릅니다.

[반복 예제](../../../examples/repeat/)에서 항목 순서를 바꿔 보세요.
