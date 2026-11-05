---
title: View와 Component
description: View로 화면을 선언하고 Component로 화면의 트리를 구성합니다.
---

**View**는 실행할 화면을 정의합니다. **Component**는 버튼, 카드, 자체 상태를 가진 패널처럼 화면을 이루는 재사용 단위입니다. View는 하나의 `render` 노드에서 시작합니다.

## 화면 선언하기

아래 JSON은 View 정의 전체입니다. 빠른 시작에서 만든 렌더러의 `renderer.mount`에 `view`로 전달합니다.


```json
{
  "render": {
    "id": "hello",
    "componentRef": "shadcn.Button",
    "inputs": {
      "text": "Hello, Viewstem"
    }
  }
}
```


화면에 **Hello, Viewstem** 버튼이 표시됩니다. 정의의 `inputs.text`를 바꾸고 다시 적용하면 버튼 문구도 바뀝니다.

## render 노드 읽기

| 필드 | 의미 |
|---|---|
| `id` | 소유 범위 안에서 이 Component 사용 위치를 식별합니다. |
| `componentRef` | 등록된 Component 정의를 선택합니다. |
| `inputs` | Component의 포트에 값이나 연결을 전달합니다. |

`hello`는 노드 ID이고 `shadcn.Button`은 정의 ID입니다. 여러 노드가 같은 정의를 서로 다른 입력으로 사용할 수 있습니다. Viewstem이 이름만 보고 Component를 만들어 주지는 않습니다. 앱에서 계약과 렌더링 구현을 등록해야 합니다.

이 장의 예제는 선택 패키지인 shadcn UI 세트를 사용합니다. 빠른 시작에서 `button`을 등록한 것처럼 예제에서 사용하는 `button`, `badge`, `card` 등의 패밀리를 마운트 전에 등록하세요. JSON은 화면 구성을, 등록한 UI 세트는 실제 표현을 담당합니다.

## 슬롯으로 노드 포함하기

Component는 이름 있는 `slots`로 자식 노드를 받을 수 있습니다. 아래 View는 카드 안에 배지를 넣습니다.


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "content",
          "componentRef": "shadcn.Card.Content",
          "slots": {
            "default": [
              {
                "id": "status",
                "componentRef": "shadcn.Badge",
                "inputs": {
                  "text": "Draft"
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```


`default` 슬롯은 노드 배열을 받습니다. 루트는 여전히 카드 하나이고, 슬롯에 넣은 노드들이 그 아래 트리를 이룹니다. 사용할 수 있는 슬롯 이름은 받는 Component의 계약에 정해져 있습니다.

[슬롯 예제](../../../examples/slots/)에서 자식 노드를 바꿔 보세요.
