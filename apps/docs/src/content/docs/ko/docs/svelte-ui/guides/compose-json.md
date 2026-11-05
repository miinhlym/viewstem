---
title: JSON으로 컴포넌트 조합
description: 컴포넌트에 입력과 슬롯을 넘기고 이벤트를 Viewstem Action에 연결합니다.
sidebar:
  order: 2
---

노드의 `componentRef`에는 등록된 컴포넌트 ID를 씁니다. [컴포넌트 세트](../../component-sets/)에서 해당 ID의 입력, 슬롯, 이벤트를 확인하세요. 업데이트할 때도 노드의 `id`는 유지하세요. HTML ID가 필요하고 해당 부품이 지원한다면 `inputs.id`를 따로 지정합니다.

## Dialog 트리거에 버튼 배치

`dialog`와 `button`을 등록하고 아래 View를 `renderer.mount`에 넘깁니다. Button이 트리거의 DOM 요소를 렌더링합니다. Dialog 부품은 `Dialog.Root`의 기본 슬롯에서 문맥을 받습니다.

```json
{
  "render": {
    "id": "settings",
    "componentRef": "shadcn.Dialog.Root",
    "slots": {
      "default": [
        {
          "id": "open",
          "componentRef": "shadcn.Dialog.Trigger",
          "slots": {
            "child": [
              {
                "id": "settings-button",
                "componentRef": "shadcn.Button",
                "inputs": { "text": "설정 열기", "variant": "outline" }
              }
            ]
          }
        },
        {
          "id": "settings-content",
          "componentRef": "shadcn.Dialog.Content",
          "slots": {
            "default": [
              {
                "id": "settings-title",
                "componentRef": "shadcn.Dialog.Title",
                "inputs": { "text": "설정" }
              },
              {
                "id": "settings-help",
                "componentRef": "shadcn.Dialog.Description",
                "inputs": { "text": "작업 공간 환경을 설정합니다." }
              },
              {
                "id": "close",
                "componentRef": "shadcn.Dialog.Close",
                "inputs": { "text": "닫기" }
              }
            ]
          }
        }
      ]
    }
  }
}
```

지원되는 부품에는 `inputs.text`로 일반 텍스트를 전달합니다. `slots.default`에 자식이 있으면 자식을 표시합니다. 둘 다 비워 두면 부품이 자체 아이콘, 선택한 레이블, 자리표시자를 유지할 수 있습니다.

`slots.child`를 지원하는 부품에는 이 세트에서 DOM 요소를 렌더링하는 부품 하나를 넣습니다. 브리지는 props, 이벤트 핸들러, Svelte attachment를 그 요소에 전달합니다. 사용자 정의 어댑터, 여러 부품을 묶은 루트, 자식 목록은 이 슬롯의 지원 범위를 벗어납니다.

## 사용자 입력을 State에 기록

이 View에는 `input`을 등록합니다. 표시하는 값은 State에서 읽고, `input` 핸들러는 브라우저가 전달한 문자열을 State 포트에 씁니다. 한글 IME의 조합 중 값은 입력 요소에 유지되고 확정된 값이 전달됩니다.

```json
{
  "states": {
    "name": { "kind": "State", "schema": { "type": "string" }, "initial": "" }
  },
  "render": {
    "id": "name",
    "componentRef": "shadcn.Input",
    "inputs": { "value": { "@path": "/states/name" }, "aria-label": "이름" },
    "on": {
      "input": {
        "id": "write-name",
        "action": {
          "ports": {
            "target": { "kind": "State", "schema": { "type": "string" }, "required": true },
            "next": { "kind": "Value", "schema": { "type": "string" }, "required": true }
          },
          "steps": [
            { "kind": "SetState", "target": { "@path": "/ports/target" }, "value": { "@path": "/ports/next" } }
          ]
        },
        "inputs": {
          "target": { "@path": "/states/name" },
          "next": { "@path": "/event/value" }
        }
      }
    }
  }
}
```

`Switch.checkedChange`나 `Dialog.Root.openChange` 같은 콜백은 불리언 같은 네이티브 인수를 `/event/value`에 담습니다. 다중 선택 `NativeSelect.Root`의 DOM `change`는 첫 선택 값만 문자열로 전달합니다. 배열을 받으려면 `Select.Root`에서 `type: "multiple"`과 `valueChange`를 사용하세요.

DOM 페이로드 구조는 [이벤트 페이로드](../../support/#event-payloads), View 노드·슬롯·이벤트 Action 계약은 [DSL 레퍼런스](/ko/docs/dsl/)를 참고하세요.
