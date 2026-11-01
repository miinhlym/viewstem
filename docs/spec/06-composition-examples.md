# 도메인 중립 연결 예시

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

## 10.9 도메인 중립 연결 예시

ui.Column은 default 슬롯을 세로 배치하고, ui.Text는 text를 표시하며, ui.TextInput은 value 문자열과 change payload {value:string}, ui.Button은 label과 click payload {}를 지원하는 **예시 등록 계약**이다. 이 필드가 전역 필수 카탈로그라는 뜻은 아니다.

아래 ui.confirm은 코드형 Action의 공개 계약이다. 서비스 구현 함수는 message를 확인창에 표시하고 boolean을 반환하도록 별도로 등록한다. output.value가 없다고 선언형 Action으로 단독 실행할 수 있는 JSON은 아니다.

```json
{
  "kind": "Action",
  "id": "ui.confirm",
  "spec": {
    "ports": {
      "message": {
        "kind": "Value",
        "schema": {
          "type": "string"
        },
        "required": true
      }
    },
    "output": {
      "schema": {
        "type": "boolean"
      }
    }
  }
}
```

다음 배열은 서비스가 공급하는 선언형 리소스다. TextInput 변경 → 명시 inputs → SetState → 동일 State를 읽는 preview 갱신이 이어진다. 버튼 click → 공개 checkRequested payload → 외부 on → 코드 Action 호출은 별도 흐름이다.

```json
[
  {
    "kind": "Action",
    "id": "set-title",
    "spec": {
      "ports": {
        "target": {
          "kind": "State",
          "schema": {
            "type": "string"
          },
          "required": true
        },
        "text": {
          "kind": "Value",
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
            "@path": "/ports/target"
          },
          "value": {
            "@path": "/ports/text"
          }
        }
      ],
      "output": {
        "schema": {
          "type": "string"
        },
        "value": {
          "@path": "/ports/text"
        }
      }
    }
  },
  {
    "kind": "Component",
    "id": "title-editor",
    "spec": {
      "ports": {
        "title": {
          "kind": "State",
          "schema": {
            "type": "string"
          },
          "required": true
        }
      },
      "slots": {
        "footer": {}
      },
      "events": {
        "checkRequested": {
          "schema": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string"
              }
            },
            "required": [
              "title"
            ],
            "additionalProperties": false
          }
        }
      },
      "render": {
        "id": "editor-root",
        "componentRef": "ui.Column",
        "slots": {
          "default": [
            {
              "id": "title-input",
              "componentRef": "ui.TextInput",
              "inputs": {
                "value": {
                  "@path": "/ports/title"
                }
              },
              "on": {
                "change": {
                  "actionRef": "set-title",
                  "inputs": {
                    "target": {
                      "@path": "/ports/title"
                    },
                    "text": {
                      "@path": "/event/value"
                    }
                  }
                }
              }
            },
            {
              "id": "check-button",
              "componentRef": "ui.Button",
              "inputs": {
                "label": "확인"
              },
              "on": {
                "click": {
                  "emit": "checkRequested",
                  "payload": {
                    "title": {
                      "@path": "/ports/title"
                    }
                  }
                }
              }
            },
            {
              "id": "footer-outlet",
              "componentRef": "ui.Column",
              "slots": {
                "default": {
                  "@path": "/slots/footer"
                }
              }
            }
          ]
        }
      }
    }
  },
  {
    "kind": "View",
    "id": "editor-view",
    "spec": {
      "states": {
        "title": {
          "kind": "State",
          "schema": {
            "type": "string"
          },
          "initial": "첫 제목"
        }
      },
      "render": {
        "id": "editor",
        "componentRef": "title-editor",
        "inputs": {
          "title": {
            "@path": "/states/title"
          }
        },
        "slots": {
          "footer": [
            {
              "id": "preview",
              "componentRef": "ui.Text",
              "inputs": {
                "text": {
                  "@path": "/states/title"
                }
              }
            }
          ]
        },
        "on": {
          "checkRequested": {
            "id": "confirmTitle",
            "actionRef": "ui.confirm",
            "inputs": {
              "message": {
                "@path": "/event/title"
              }
            }
          }
        }
      }
    }
  }
]
```

/ports/title 읽기는 연결된 State의 값, set-title의 target 입력은 같은 State 셀을 연결한다. footer의 /states/title은 슬롯을 작성한 View의 문맥이다. ui.confirm의 true/false 결과는 /actions/confirmTitle/data에서 관찰하고 status로 성공 여부를 판단한다. 이 값은 State가 아니므로 SetState로 수정하지 않는다.

이 예시의 title-input.on.change는 id가 없지만 실제 호출 연결이다. 해당 Action이 아직 실행 중일 때 같은 연결에서 들어온 추가 호출은 무시한다. 반대로 실행 정보를 읽으려고 같은 View 안의 다른 버튼에도 `on.click.id: "confirmTitle"`을 붙이면 조회 id 중복 오류다. 두 연결이 같은 ui.confirm을 호출하는지와 무관하다. title-editor를 두 번 배치했을 때 각 인스턴스 내부에 선언한 같은 로컬 조회 id는 서로 독립적이다. [호출 연결 ID 규칙](05-component-view.md#이벤트와-action-연결)을 따른다. [E56]

checkRequested payload 자체가 유효해도 ui.confirm의 message 입력 평가·검증은 별도다. 예시의 message 연결을 잘못 수정해 입력 준비가 실패하면 Action 단계는 실행하지 않고, 해당 연결의 status는 error, data는 null이 되며 error에서 입력 준비 실패 원인과 문제 입력을 식별할 수 있어야 한다. 정확한 오류 필드명은 아직 미정이다. [Action 계약](04-action.md)을 따른다. [E57]

### 반복 카드와 Grid 연결 예시

다음은 View.spec에 들어갈 구조 예시다. item-card는 item Value 포트를 가진 선언형 Component, ui.Grid는 앞 절의 배치 계약을 지원한다고 가정한다. 각 카드의 상태는 item-card 인스턴스에 속한다.

```json
{
  "states": {
    "items": {
      "kind": "State",
      "schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "label": {
              "type": "string"
            }
          },
          "required": [
            "id",
            "label"
          ]
        }
      },
      "initial": [
        {
          "id": "a",
          "label": "첫 항목"
        },
        {
          "id": "b",
          "label": "둘째 항목"
        }
      ]
    }
  },
  "render": {
    "id": "cards",
    "componentRef": "ui.Grid",
    "inputs": {
      "layout": {
        "card": {
          "columnSpan": 4,
          "rowSpan": 1
        }
      }
    },
    "slots": {
      "default": [
        {
          "id": "card",
          "componentRef": "item-card",
          "repeat": {
            "items": {
              "@path": "/states/items"
            },
            "as": "item",
            "key": {
              "@path": "/repeat/item/id"
            }
          },
          "inputs": {
            "item": {
              "@path": "/repeat/item"
            }
          }
        }
      ]
    }
  }
}
```
