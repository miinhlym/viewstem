# Action · 호출 · 반환 계약

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**예시 해석:** 아래 발전소·날씨·협력사 등의 명칭은 이전 논의의 설명용 예시다. `example.com` 계열 주소와 임의 ID만 사용하며 실제 회사 API·비밀값·기본 등록 리소스가 아니다. core는 이 도메인에 의존하지 않는다.

순차 실행·실패 중단·입력 스냅샷·code/declarative output·void·호출 연결/소유자 폐기의 규범은 [기본 명세의 Action 계약](../VIEWSTEM-SPEC.md#7-action-실행과-이벤트-연결)에 있다. 이 문서는 그 계약의 JSON 상세다. 2026-10-29에 기존 승인 If/Assert 문법과 호출 연결 폐기 의미를 복원했다. [E43, E48]

## 10.4 Action: 명시적으로 실행하는 동작

**확정 구조:** Action은 ports와 순차 steps를 가진다. `Query`·`Action`·`Variable` 단계에는 각각 `queryRef`·`actionRef`·`variableRef` 또는 실제 인라인 `spec` 중 정확히 하나만 둔다. 둘 다 있거나 둘 다 없으면 오류다. `inputs`는 선택한 대상의 ports에 전달한다. `SetState`는 `target`과 `value`를 사용한다. 아래 예시는 Query의 CRUD 정의를 Action에서 명시 실행하고 응답의 id를 연결된 State에 기록한다. API 응답이 `{ "id": "memo-1" }`이라고 가정한다. [E29–E31]

```json
{
  "kind": "Action",
  "id": "save-memo",
  "name": "메모 저장",
  "spec": {
    "ports": {
      "plantId": {
        "kind": "Value",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      "content": {
        "kind": "Value",
        "required": true,
        "schema": {
          "type": "string"
        }
      },
      "savedMemoId": {
        "kind": "State",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    },
    "steps": [
      {
        "id": "save",
        "kind": "Query",
        "spec": {
          "ports": {
            "plantId": {
              "kind": "Value",
              "required": true,
              "schema": {
                "type": "string"
              }
            },
            "content": {
              "kind": "Value",
              "required": true,
              "schema": {
                "type": "string"
              }
            }
          },
          "sources": {
            "main": {
              "datasourceRef": "plant-api",
              "request": {
                "method": "POST",
                "path": "/memos",
                "body": {
                  "plantId": {
                    "@path": "/ports/plantId"
                  },
                  "content": {
                    "@path": "/ports/content"
                  }
                }
              }
            }
          },
          "transform": {
            "input": {
              "@path": "/sources/main"
            }
          }
        },
        "inputs": {
          "plantId": {
            "@path": "/ports/plantId"
          },
          "content": {
            "@path": "/ports/content"
          }
        }
      },
      {
        "kind": "SetState",
        "target": {
          "@path": "/ports/savedMemoId"
        },
        "value": {
          "@path": "/steps/save/id"
        }
      }
    ],
    "output": {
      "schema": {
        "type": "string"
      },
      "value": {
        "@path": "/steps/save/id"
      }
    }
  }
}
```

순차·실패 중단, 입력 스냅샷, SetState 전체 교체는 [기본 명세의 Action 계약](../VIEWSTEM-SPEC.md#7-action-실행과-이벤트-연결)을 적용한다. 위 Action은 /steps/save/id를 output.value로 평가하여 string으로 검증한 뒤 반환한다. 호출자는 /steps/호출단계ID에서 그 문자열 자체를 읽는다. Query·Variable·중첩 Action은 완료 결과를 사용하고 SetState는 Derived·Query data·계산 결과에 쓸 수 없다. 외부 저장 후 출력 검증이나 후속 단계가 실패해도 저장이 자동 취소되지는 않는다.

### SetState의 교체·검증·실패 범위

SetState.target의 `@path`는 명시적으로 연결된 기존 State 하나를 쓰기 대상으로 해석하고, value의 값으로 **그 State의 값 전체를 교체**한다. 예를 들어 기존 값이 `{"a":1,"b":2}`이고 새 값이 `{"a":3}`이면 결과는 `{"a":3}`이다. 객체를 자동 병합하거나 전체 StateStore를 교체하지 않으며, 없는 State를 자동 생성하지 않는다. 대상 미연결·쓰기 권한 없음·Derived·타입 불일치는 오류다. Query data·일반 입력값·계산 결과도 쓰기 대상이 될 수 없다. 쓰기는 기존 StateStore의 검증·변경·reaction 처리 경로를 따른다. [E31, E67]

**완료된 SetState의 변경은 뒤 단계나 output이 실패해도 유지한다.** 예를 들어 선택 State를 바꾼 뒤 Query 또는 Assert가 실패하면 Action은 오류로 끝나지만 앞서 기록한 선택값을 자동 복원하지 않는다. 각 쓰기의 검증과 코어 State·구성 변경 묶음의 원자성은 Action.steps 전체의 자동 롤백을 뜻하지 않는다. 이미 성공한 외부 API 변경에도 같은 비롤백 원칙을 적용한다. [E67]

### 참조 실행과 인라인 실행의 경계

```json
{
  "steps": [
    {
      "id": "count",
      "kind": "Variable",
      "variableRef": "count-selected-plants",
      "inputs": {
        "plants": [
          "plant-a"
        ]
      }
    },
    {
      "kind": "Action",
      "actionRef": "save-memo",
      "inputs": {
        "plantId": "plant-a",
        "content": "점검 완료",
        "savedMemoId": {
          "@path": "/ports/savedMemoId"
        }
      }
    }
  ]
}
```

위 조각은 savedMemoId State 포트가 있는 Action 내부 예시다. Query 단계도 `{ "kind": "Query", "queryRef": "plants", "inputs": { "organizationId": "org-a" } }`로 참조한다. 참조 키를 없애고 해당 리소스의 본문을 spec에 넣으면 인라인 정의가 되며, 두 방식을 동시에 쓰지 않는다. `kind: Http`·Mutation·Request를 별도 Action 요청 kind로 추가하지 않는다. 호출 위치의 `{ "actionRef": "...", "inputs": ... }`와 Action 내부 단계의 `kind: Action`을 구분한다. [E30]

### If와 Assert의 조건 계약

**확정:** 다음은 각각 boolean Value 포트 `shouldContinue`, `isValid`를 선언한 Action 안의 단계 조각이다. 조건은 공통 값 표현식으로 boolean을 받아야 하며 truthiness로 변환하지 않는다. 복잡한 계산은 Variable/CEL로 수행한다. [E48]

```json
{
  "kind": "If",
  "condition": { "@path": "/ports/shouldContinue" },
  "then": [],
  "else": []
}
```

| 필드·범위 | 의미 |
|---|---|
| condition | boolean 조건. 평가 실패·비boolean은 오류 |
| then | 필수 단계 배열. true일 때 순차 실행 |
| else | 선택적 단계 배열. false이며 생략이면 작업 없이 다음 단계 진행 |
| 중첩·실패 | If 중첩 가능. 선택 분기의 단계 실패는 Action 중단이며 else는 오류 처리/catch가 아님 |
| 결과 참조 | 앞서 성공한 바깥 단계 결과는 분기 안에서 읽을 수 있음. 분기 내부 결과는 바깥·반대 분기에서 읽을 수 없음 |
| If 자체 결과 | 반환 결과를 만들지 않음. id 자체를 금지한다는 추가 규칙은 아님 |

```json
{
  "kind": "Assert",
  "condition": { "@path": "/ports/isValid" },
  "message": "계속 진행할 수 없습니다."
}
```

Assert.condition은 strict boolean이다. true이면 다음 단계로 가고 false이면 message를 포함한 오류를 호출자에게 전달한다. 실패 뒤 단계와 Action.output은 평가하지 않으며 앞서 성공한 외부 효과를 롤백하지 않는다. **U13:** message는 선택적 문자열 값 표현식이며 condition이 false일 때만 평가한다. 생략하면 `Assertion failed`를 사용하고 ASSERTION_FAILED로 실패한다. message 평가 실패·비문자열은 원인을 보존한 평가/타입 오류이며 성공으로 바꾸지 않는다. 구체 객체는 [공통 오류](07-host-integration.md#공통-오류와-진단)를 따른다.

SetState·RefreshQuery·Assert·If 단계는 결과값이 없는 void 단계다. 단계 id가 있어도 그 결과를 /steps/id에서 읽으면 참조 오류이며, 마지막 단계 값을 Action output으로 암묵 반환하지 않는다. [U13]

### 재귀·확장 실행의 경계

**확정(U13, U35):** 선언형 Action의 직접·상호 호출 순환은 조건부 분기 안의 참조까지 등록 검증에서 거절한다. 인라인 Action도 같은 그래프 검사에 포함한다. 코드 Action의 `context.invokeAction`으로 시작한 하위 호출은 부모 호출 스택을 이어받으며, await 뒤 호출이나 선언형/코드형 혼합에서도 동일 정의가 현재 스택에 있으면 ACTION_RECURSION으로 거절한다. 순환이 없는 순차·병렬 하위 호출은 허용한다. 등록된 신뢰 코드 함수 내부의 임의 재귀를 정적으로 분석하거나 강제로 종료한다는 보장은 아니다.

코드 Action은 검증·격리된 inputs와 호출 수명에 묶인 State/Query 핸들, AbortSignal을 받는다. 취소 뒤 새로운 write/refresh/retry는 CANCELLED이며, 늦은 반환값을 수용하지 않는다. 함수가 signal을 무시해 이미 시작한 외부 효과를 끝내는 것은 자동 롤백 대상이 아니다. 코드 반환 Promise의 reject와 결과 검증 실패는 기존 Action 오류 경로로 전파한다.

**코드 하위 호출(U35):** 실행 문맥의 `invokeAction({actionRef 또는 action, inputs})`은 현재 실행의 하위 Action을 시작한다. owner·취소·스택은 부모에서 전달하고 호출자가 바꾸지 못한다. inputs는 명시 전달하며 부모 inputs를 자동 캡처하지 않는다. 대상·권한·입력·출력을 동일한 Action 경로에서 검증하며 결과/오류를 Promise로 돌려준다. 부모 취소는 진행 중인 자손 호출에 전파되고 완료된 State/API 효과는 유지한다. 외부 `runtime.invokeAction`은 독립 호출이며 같은 owner·Action이라는 이유로 부모의 하위 호출로 추측하지 않는다. 코드 Action에서도 내부 작업은 문맥의 함수를 사용해야 한다. 신뢰 코드가 클로저로 확보한 외부 runtime/서비스 기능을 강제 격리한다는 보장은 아니다.

하위 결과와 오류를 부모 결과에 연결하려면 반환 Promise를 await/return한다. 병렬 작업은 Promise.all 등으로 명시 대기할 수 있다. 부모가 성공·실패·취소로 끝나면 남은 하위 실행을 취소하고 보관한 호출 함수로 새 작업을 시작하는 것도 CANCELLED다. await하지 않은 작업을 암묵적으로 독립 실행으로 전환하거나 부모 완료를 무기한 미루지 않는다. 이는 수명 누수를 막기 위한 기술 세부이며, 일반 코드 Action의 명시 try/catch 복구 계약은 유지한다.

### v1 오류 복구의 범위

**확정(U14):** v1 선언형 Action에는 Try/Catch/Finally 단계나 catch/finally 필드를 제공하지 않는다. 사용하면 등록 시 INVALID_DEFINITION이며 무시하거나 성공 경로로 해석하지 않는다. 단계 실패 시 남은 단계와 정상 output 평가를 중단하고 호출자·실행 관찰에 실패를 전달한다. 앞서 완료한 State 쓰기와 외부 효과는 유지한다. [E67]

복구·보상·정리가 필요한 흐름은 등록한 코드 Action이 try/catch/finally 등으로 명시적으로 작성한다. 처리한 오류에서 정상 반환하고 output 검증까지 통과하면 해당 코드 Action은 성공할 수 있고, 처리하지 않은 예외·정리 실패·잘못된 output은 실패다. 자동 롤백·자동 재시도나 선언형 후속 단계 재개를 추가하지 않는다. 일반 로딩 표시는 아래 실행 관찰의 running을 사용한다.

취소 후에도 살아 있는 코드의 finally는 언어의 실행 규칙에 따라 실행될 수 있지만 core가 종료된 프로세스나 협력하지 않는 코드를 대신 정리한다는 보장은 없다. 취소를 catch했다고 호출이 다시 유효해지지 않으며 늦은 정상 반환은 폐기한다. 취소된 호출의 State/Query 핸들로 새 쓰기·갱신을 하는 것은 계속 거절한다. 이미 시작한 외부 효과의 보상은 서비스 코드가 별도 책임으로 수행한다.

### 호출 연결의 식별과 실행 관찰

on의 Action 호출 연결에는 **선택적 id**를 붙이며 `/actions/id`로 그 연결의 실행 정보를 읽는다. 이 id는 Action 정의의 ID나 UI 노드 ID와 별개다. 관찰 이름이 필요 없으면 생략할 수 있고, 생략해도 각 호출 연결은 실행 상태와 실행 중 추가 호출을 무시하는 규칙을 독립적으로 유지한다. 같은 Action을 호출한다는 이유로 서로 다른 연결의 실행 상태를 공유하지 않는다. [E56]

같은 소유 View/Component 인스턴스 범위에 실제 생성된 호출 연결의 관찰 id가 중복되면 오류다. 슬롯 내용을 여러 번 투영해서 작성자 범위에 같은 id의 연결이 생겨도 자동 공유하지 않고 오류로 처리한다. 서로 다른 Component 인스턴스의 내부 id는 같은 이름을 사용할 수 있다. 연결 제거 후 같은 id로 다시 생성하면 새 연결이며 이전 실행 결과를 이어받지 않는다. 반복 슬롯 투영의 개별 실행 상태 조회 주소는 1차 지원 범위에 추가하지 않는다. [E56]

실행 정보는 런타임이 관리하는 읽기 전용 값이다. status는 idle/running/success/error, running은 status가 running인지 나타낸다. 새 실행이 실제 시작되면 이전 data/error를 비운다. data는 idle·running·실패 및 output 없는 성공에서 null이며, 성공했고 output이 있으면 검증된 실제 반환값이다. 오류가 없으면 error는 null이다. 성공 여부를 data의 truthiness로 판단하지 않는다. 같은 연결이 실행 중일 때의 추가 호출은 무시하고 기존 실행 정보는 유지한다. 큐나 기존 실행의 자동 취소를 추가하지 않는다.

초기화 순서는 **호출 연결 등록 → idle/running:false/data:null/error:null 초기화 → Component inputs 평가**다. 첫 UI 입력에서 `/actions/id/running`을 읽을 수 있어야 하며 JSON 속성 순서에 따라 달라지지 않는다.

### Action 입력 준비 실패의 진단

호출 입력을 평가하거나 포트 계약으로 검증하는 과정에서 실패하면 Action.steps는 **0개 실행**한다. 해당 호출 연결의 status는 error, running은 false, data는 null이며 error에는 **입력 평가·검증 실패라는 원인과 문제 입력을 식별할 정보**를 남긴다. 관찰 id가 있으면 같은 `/actions/id/error`에서 실행 준비 실패를 읽을 수 있다. 이전 성공 data를 이번 호출 결과처럼 유지하거나 정상 output을 평가하지 않는다. 잘못된 actionRef처럼 사전에 판별 가능한 설정 오류는 리소스 검증에서 잡는다. 오류 DTO·필드명·입력 위치는 [공통 오류](07-host-integration.md#공통-오류와-진단)를 따르며 실제 실패 전파를 구현 검증한다. [E57]

### 호출 연결이 제거될 때

실제 on 연결 제거 또는 소유 View/Component 폐기는 해당 호출과 하위 Action의 남은 단계·늦은 결과를 폐기하는 조건이다. View를 유지한 채 버튼의 호출 연결을 제거하는 경우와, Action의 SetState로 자기 연결이 실제 제거되는 경우도 포함한다. 코드형에는 협력적 취소를 알리고 해당 호출의 핸들로 새 State 쓰기·Query refresh를 하지 못하게 한다. 재생성된 같은 id의 연결과 공유 대상/다른 호출은 별개다. 단순 숨김·렌더러 분리나 이미 발생한 서버 효과의 롤백과 혼동하지 않는다. 호출 한정 핸들과 signal은 U13의 최소 SDK를 따른다. [E43, E42]
