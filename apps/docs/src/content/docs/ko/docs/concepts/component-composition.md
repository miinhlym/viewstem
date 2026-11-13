---
title: Component 재사용
description: 입력과 인스턴스 소유 범위를 명확히 하면서 Component를 재사용합니다.
---

재사용 **Component**는 render 트리와 필요한 입력 포트를 하나의 정의로 묶습니다. State, Derived, Query, 슬롯, 이벤트도 포함할 수 있습니다. 모든 기능을 넣을 필요 없이 필요한 것만 선언합니다.

## Component 정의하기

마운트 전에 이 리소스를 `renderer.runtime.registry.registerResources([definition])`으로 등록합니다. 기본 브라우저 렌더러에는 배지 카탈로그가 포함되어 있습니다.


```json
{
  "kind": "Component",
  "id": "project-label",
  "spec": {
    "ports": {
      "name": {
        "kind": "Value",
        "schema": {
          "type": "string"
        },
        "required": true
      }
    },
    "render": {
      "id": "label",
      "componentRef": "shadcn.Badge",
      "inputs": {
        "text": {
          "@path": "/ports/name"
        }
      }
    }
  }
}
```


이 Component는 `name`을 받아 배지로 표시합니다. 내부 노드는 `/ports/name`을 읽으므로 어떤 View에서 사용될지 몰라도 동작합니다.

## 같은 정의 두 번 사용하기

`card` 패밀리도 등록한 뒤 다음 View를 마운트합니다.


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "onboarding",
          "componentRef": "project-label",
          "inputs": {
            "name": "Onboarding"
          }
        },
        {
          "id": "billing",
          "componentRef": "project-label",
          "inputs": {
            "name": "Billing"
          }
        }
      ]
    }
  }
}
```


카드에 **Onboarding**과 **Billing**이 표시됩니다. 두 노드 모두 `project-label`을 사용하지만 노드 ID와 입력은 각각 다릅니다. Component에 로컬 State가 있다면 State도 인스턴스별로 생성됩니다.

## State를 명시적으로 공유하기

두 Component가 같은 값을 편집해야 한다면 Value 대신 State 포트를 선언합니다. 부모 View에서 두 인스턴스의 `inputs`를 같은 `/states/title`에 연결하면 기존 State 하나를 공유합니다. 두 로컬 State에 같은 초기값을 넣는 것만으로는 공유되지 않습니다.

## 슬롯과 이벤트로 조합하기

Component의 `slots` 계약에 이름 있는 슬롯을 선언하고 `/slots/body` 같은 경로로 내용을 배치합니다. 호출자가 슬롯에 노드를 전달하며, 전달한 노드의 표현식은 작성한 호출자의 범위에서 평가합니다. 받는 Component의 내부 State에 접근하게 되는 것은 아닙니다.

호출자에게 발생 사실을 알리려면 `events`에 이벤트 스키마를 선언하고 내부 이벤트를 `on: { click: { emit: "select", payload: ... } }`로 전달합니다. 호출자는 `on.select`에 Action을 연결합니다. 내부 UI와 호출자의 후속 동작을 분리할 수 있습니다.

[Component 재사용 예제](../../../examples/reusable-component/)에서 두 인스턴스를 확인해 보세요.

슬롯 선언·전달과 이벤트의 정확한 JSON 필드는 [Component 레퍼런스](../../dsl/view-and-component/)에서 확인하세요.
