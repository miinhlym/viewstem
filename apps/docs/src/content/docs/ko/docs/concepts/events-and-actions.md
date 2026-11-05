---
title: 이벤트와 Action
description: UI 이벤트를 상태 변경이나 서비스 호출을 수행하는 단계에 연결합니다.
---

**이벤트**는 클릭이나 입력 변경처럼 발생한 사실을 알립니다. **Action**은 그에 따라 수행할 동작을 정의합니다. render 노드의 `on`으로 둘을 연결합니다.

## 클릭으로 State 변경하기

아래 View에는 처음에 **Draft**라고 표시된 버튼이 있습니다.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    }
  },
  "render": {
    "id": "save",
    "componentRef": "shadcn.Button",
    "inputs": {
      "text": {
        "@path": "/states/title"
      }
    },
    "on": {
      "click": {
        "id": "save-title",
        "action": {
          "ports": {
            "title": {
              "kind": "State",
              "schema": {
                "type": "string"
              },
              "required": true
            }
          },
          "steps": [
            {
              "kind": "SetState",
              "target": {
                "@path": "/ports/title"
              },
              "value": "Saved"
            }
          ]
        },
        "inputs": {
          "title": {
            "@path": "/states/title"
          }
        }
      }
    }
  }
}
```


버튼을 클릭하면 문구가 **Saved**로 바뀝니다. 이벤트 연결의 `inputs`가 View의 `title` State를 찾습니다. Action의 State 포트가 기존 State에 연결되고 `SetState`가 `/ports/title`을 통해 값을 씁니다. Value 포트라면 현재 값만 전달받습니다.

## 이벤트 데이터 전달하기

입력 Component는 `{ "value": "New title" }` 같은 payload를 보낼 수 있습니다. 이벤트 연결의 `inputs`에서 `/event/value`를 읽어 Action의 Value 포트로 전달하고, Action 안에서는 `/ports/next`로 읽습니다. Action이 받는 것은 선언된 데이터이며 브라우저 DOM 이벤트 객체가 아닙니다.

Value 입력은 호출이 시작될 때의 값으로 고정됩니다. Action이 실행되는 동안 폼을 편집해도 이미 시작한 호출의 입력이 바뀌지는 않습니다.

## 단계 순서와 결과

`steps`는 순서대로 실행됩니다. Query 실행, 다른 Action 호출, Variable 계산, State 쓰기, Query 새로고침, `If` 분기, `Assert` 검사로 구성할 수 있습니다. 결과를 만드는 단계에 `id`를 붙이면 뒤 단계에서 `/steps/id`로 검증된 결과를 읽습니다.

선언형 Action이 결과를 반환하려면 `output`에 타입 계약과 `value`를 선언합니다. `output`을 생략하면 반환값이 없으며 마지막 단계 결과를 자동으로 반환하지 않습니다.

단계가 실패하면 뒤 단계는 실행하지 않습니다. 앞서 완료된 State 쓰기와 외부 요청의 효과는 유지됩니다. Action이 전체 동작을 자동으로 롤백하지는 않습니다.

## 실행 상태 관찰하기

연결 ID `save-title`로 `/actions/save-title/status`를 읽으면 `idle`, `running`, `success`, `error` 중 현재 상태를 얻습니다. `running`, `data`, `error`도 관찰할 수 있습니다. 이 ID는 재사용 Action 정의가 아니라 호출 연결을 식별합니다. 같은 연결이 실행 중일 때의 추가 호출은 무시합니다.

연결이나 소유 인스턴스가 제거되면 남은 실행을 취소합니다. 이미 발생한 외부 효과까지 되돌리지는 않습니다.

[State 변경 예제](../../../examples/set-state/)에서 클릭부터 화면 변경까지 따라가 보세요.
