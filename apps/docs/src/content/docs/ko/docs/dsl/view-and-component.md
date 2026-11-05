---
title: View와 Component
description: 렌더 노드와 Component 계약, 슬롯과 이벤트 연결, 키 기반 반복을 설명합니다.
sidebar:
  order: 3
---

## ViewSpec and ComponentSpec

| 필드 | 계약 |
| --- | --- |
| `render` | 단일 [ComponentNode](#componentnode)가 필수입니다. 루트에는 `when`을 둘 수 있고 `repeat`는 허용되지 않습니다. |
| `ports` | 선택적 공개 입력 맵. |
| `states` | 소유하는 State와 Derived의 선택적 선언 맵. |
| `queries` | 소유하는 Query의 선택적 사용 맵. |
| `queryDefaults` | 상속되는 `refresh`, `intervalMs`의 선택적 설정. |
| `reactions` | 선택적 State reaction 배열. |
| `slots` | Component 전용. 공개 슬롯 이름을 `{ "required": true }` 또는 선택적 계약(`{}` 또는 `{ "required": false }`)에 연결합니다. |
| `events` | Component 전용. 공개 이벤트 이름별 payload 타입 계약 맵입니다. |

코드형 Component는 `ComponentContract`를 등록합니다. Component 리소스 본문인 `ComponentPublicContract`에는 `ports`, `slots`, `events`만 두고 렌더러가 구현을 제공합니다. 선언형 Component는 `render` 트리를 소유하며 같은 공개 필드를 노출할 수 있습니다. [Registry](/ko/docs/core/registry/)와 [State와 포트](/ko/docs/dsl/state-and-ports/)를 참고하세요.

## ComponentNode

| 필드 | 계약 |
| --- | --- |
| `id` | 비어 있지 않은 필수 문자열. 작성 View나 Component 범위의 모든 노드 선언에서 유일해야 하며, 중첩 슬롯 내용도 포함합니다. |
| `componentRef` / `component` | 등록된 Component ID 또는 인라인 ComponentSpec 중 하나. |
| `inputs` | 대상이 선언한 포트에 전달할 선택적 표현식 맵. 기본값은 빈 객체입니다. |
| `slots` | 대상 슬롯 이름에 노드 배열이나 슬롯 전달 경로를 연결하는 선택적 맵. |
| `on` | 대상 이벤트 이름에 [Action 호출](/ko/docs/dsl/actions/#actioncall) 또는 emit을 연결하는 선택적 맵. |
| `when` | 선택적 엄격한 불리언 표현식. 기본값은 true입니다. |
| `repeat` | 키 기반 반복. 슬롯에 넣는 노드 배열에서 사용할 수 있습니다. |

### 슬롯과 이벤트

슬롯은 `[]`를 포함한 노드 배열이나, 작성 Component가 선언한 슬롯을 가리키는 `{"@path":"/slots/content"}` 같은 전달 경로를 받습니다. 선택 슬롯을 생략하면 내용이 비고, 필수 슬롯은 키를 제공해야 합니다. 전달한 콘텐츠는 작성자의 State, 포트, 이벤트 문맥을 유지합니다. 배치는 슬롯을 받는 Component가 담당합니다.

연결을 실행하기 전에 발생 Component의 공개 이벤트 계약으로 payload를 검증합니다. Action 연결은 `/event`나 `/event/value` 같은 하위 값을 읽어서 입력을 만들 수 있습니다. emit 연결에는 `emit`과 `payload`만 둡니다. 이 연결은 작성 Component의 공개 이벤트로 payload를 전달합니다. 이벤트는 자동으로 상위에 전파되지 않습니다. [Component 조합](/ko/docs/concepts/component-composition/)과 [이벤트와 Action](/ko/docs/concepts/events-and-actions/)을 참고하세요.

### 조건과 키 기반 반복

`repeat`에는 배열 표현식 `items`, 비어 있지 않은 별칭 `as`, 문자열 또는 유한 숫자 표현식 `key`가 모두 필요합니다. 런타임은 items를 평가하고, 각 항목을 `/repeat/<별칭>`에 연결한 뒤 모든 키를 검증하고, 항목별 `when`을 평가합니다. 키는 반복 선언과 이를 둘러싼 항목의 범위에서 유일합니다. 문자열 `"1"`과 숫자 `1`은 다른 키입니다. 중첩 반복은 바깥 별칭을 읽을 수 있으며 현재 활성 범위와 다른 별칭을 사용해야 합니다.

`when`이 false이면 노드와 소유 인스턴스의 수명이 끝납니다. 런타임은 해당 입력 평가와 내부 Query를 건너뛰고, 등록 시에는 정의의 정적 구조를 검사합니다. 반복되는 슬롯 전체의 평가를 제어하려면 상위 노드에 조건을 둡니다.

아래 View 본문은 등록한 `shadcn.Card.Root`의 `default` 슬롯을 사용합니다. 두 항목의 키를 모두 검사하고 **Open**만 렌더링합니다.

```json title="repeated-view.json"
{
  "render": {
    "id": "list",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "item",
          "componentRef": "shadcn.Badge",
          "repeat": {
            "items": [
              { "id": "open", "text": "Open", "visible": true },
              { "id": "closed", "text": "Closed", "visible": false }
            ],
            "as": "item",
            "key": { "@path": "/repeat/item/id" }
          },
          "when": { "@path": "/repeat/item/visible" },
          "inputs": { "text": { "@path": "/repeat/item/text" } }
        }
      ]
    }
  }
}
```

## 노드 식별

같은 작성 범위에서 노드 ID와 대상 정의가 같으면 반복 항목 순서나 노드 입력을 바꿔도 해당 인스턴스가 유지됩니다. 대상을 교체하거나 제거 후 다시 생성하면 새 수명이 시작됩니다. 반복은 항목 문맥과 키를 제공합니다. 각 항목에 별도 State나 Query가 필요하면 항목의 Component 안에 선언하세요. [View API](/ko/docs/core/view/)와 [키 기반 목록 가이드](/ko/docs/guides/keyed-list/)를 참고하세요.

## Grid 배치

Grid 배치는 등록한 레이아웃 Component가 담당합니다. 호스트는 직접 슬롯의 노드 ID를 키로 하는 배치 입력을 정의하고 core의 `computeGridLayout` 헬퍼를 사용할 수 있습니다. `GridConfig`에서 `row`와 `column`을 모두 생략하면 자동 배치하고, 둘 다 지정하면 고정합니다. 좌표와 span은 양의 안전 정수이고 좌표는 1부터 시작합니다. 기본 span은 12열 × 1행입니다. 12열에서 고정 셀을 먼저 예약하고 자동 셀은 확장 순서에 따라 앞으로 탐색합니다. 반복 선언에는 span을 지정할 수 있습니다. 반복 선언의 고정 좌표, 알 수 없는 배치 키, 겹침과 범위 초과는 헬퍼가 거절합니다. 결과는 확장된 각 노드의 주소를 `GridPlacement`에 연결합니다. [Grid 유틸리티](/ko/docs/core/utilities/#computegridlayout)를 참고하세요.
