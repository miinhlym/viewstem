# Query · 변환 · 사용 인스턴스

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**예시 해석:** 아래 발전소·날씨·협력사 등의 명칭은 이전 논의의 설명용 예시다. `example.com` 계열 주소와 임의 ID만 사용하며 실제 회사 API·비밀값·기본 등록 리소스가 아니다. core는 이 도메인에 의존하지 않는다.

## 10.2 Query: 재사용 요청과 복합 변환

**확정 구조:** `spec.ports`는 Value만 허용한다. `sources`는 이름별 맵이며 각 항목은 `datasourceRef`(또는 인라인 datasource) + `request`, `queryRef`(또는 인라인 query) + `inputs` 중 하나로 정의한다. request에는 method·path·headers·params·body를 둔다. 참조 Query의 공개 port에 입력을 명시하며 이름이 같다는 이유로 자동 상속하지 않는다. 필수 입력의 기본값도 없고 inputs도 빠졌으면 실행 전 오류로 처리한다. 외부 Component는 Query의 공개 port를 거쳐 입력하고 내부 source를 직접 덮어쓰지 않는다.

각 source는 독립적이며 맵의 순서가 실행 순서가 아니다. 형제 source의 응답을 다른 source 요청 입력으로 사용하지 않는다. `/sources/별칭`은 직접 HTTP 요청이면 응답 body, Query 참조이면 해당 Query의 최종 변환 결과다. `transform.input`은 명시하고 `steps`는 선택적 순차 변환이다. steps를 생략할 수 있지만 명시 null을 빈 배열로 처리하지 않는다. steps가 없으면 input을 그대로 반환한다. 암묵적 첫 source 선택·필수 step ID·별도 변환 DAG를 추가하지 않는다. `main`은 보통의 별칭이며 단일 source의 이름 관례는 강제하지 않는다.

```json
{
  "kind": "Query",
  "id": "plants",
  "name": "발전소 조회",
  "spec": {
    "ports": {
      "organizationId": {
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
          "method": "GET",
          "path": "/plants",
          "params": {
            "organizationId": {
              "@path": "/ports/organizationId"
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
  }
}
```

아래는 같은 Query 구조로 다른 Query를 재사용하고 입력을 전달하는 예시다. 여러 source를 추가해도 공개 사용 방식은 동일하다. 결과를 가공할 때에는 transform.steps를 사용한다. 다음 예시는 입력 연결과 결과 경로에 집중하여 결합 연산을 생략했다.

```json
{
  "kind": "Query",
  "id": "organization-plants",
  "spec": {
    "ports": {
      "organizationId": {
        "kind": "Value",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    },
    "sources": {
      "plants": {
        "queryRef": "plants",
        "inputs": {
          "organizationId": {
            "@path": "/ports/organizationId"
          }
        }
      }
    },
    "transform": {
      "input": {
        "@path": "/sources/plants"
      }
    }
  }
}
```

**변환 의미 확정:** join은 left가 기본이며 left/right/inner를 지원한다. 여러 매칭은 모든 조합을 만들고, 유입 필드가 충돌 필드를 덮어쓴다. 키 타입은 엄격히 비교하고 null은 매칭하지 않으며 키 누락은 오류다. 미매칭 필드를 임의 null로 만들어내지 않는다. concat은 배열 순서·중복·이질적 항목을 보존한다.

하위 Query의 inputs는 객체 또는 객체를 반환하는 표현식이며 명시 null을 생략으로 처리하지 않는다. 객체 템플릿의 `@@` 키는 공통 이스케이프 규칙으로 복원한 이름을 기준으로 필수 입력 연결을 검사한다. Join.mode 역시 생략 때만 left이며 명시 null은 잘못된 정의다. U32의 [후속 경계 검증](../handoff/boundary-followup-2026-10-30.md)에서 이 경계와 많은 배열의 Concat, 중첩 재사용·실패/취소를 확인했다.

### Query 실패의 확정 의미

필요한 source 하나 또는 transform 단계 하나라도 실패하면 해당 Query 전체가 실패한다. 일부 source가 성공했더라도 그 일부만 Query의 성공 데이터로 반환하지 않으며, 오류를 빈 배열로 바꾸지 않는다. 정상적으로 조회·변환된 빈 결과는 성공이다. 오류에는 **실패한 source 또는 변환 단계의 위치를 식별할 정보**를 남긴다. 실패는 해당 Query와 그 결과에 의존하는 실행에 전파하되 무관한 Query·View·UI까지 중단하지 않는다. 여러 원격 쓰기 일부 성공 뒤 실패해도 자동 롤백·정확히 한 번 실행을 보장하지 않는다. [E52]

오류는 [공통 오류 계약](07-host-integration.md#공통-오류와-진단)을 따르고 location으로 source 키 또는 transform 단계 인덱스를 식별한다. 참조된 하위 Query 오류의 cause에는 그 Query의 resource와 해당 정의 안의 location을 보존한다. 인라인 Query이면 포함 문서의 인라인 필드 경로를 가리킨다. 실행 경로를 이어 붙여 실제 선언 문서에 없는 JSON Pointer를 만들지 않는다. 모든 변환 단계에 필수 id를 새로 요구하지 않는다. E52의 실패 계약만으로 과거 성공 캐시의 모든 유지·표시 정책을 추가 확정하지 않는다. 자동 조회 결합의 **입력 변경 대기 중** 보존은 아래 E69의 별도 승인 의미다.

### Concat 단계의 확정 문법

Concat은 현재 단계 입력 배열 뒤에 `with`에 지정한 추가 배열들을 선언 순서대로 붙인다. 아래는 `/sources/base`, `/sources/extra`, `/sources/archive`가 각각 배열을 반환하는 Query의 transform 조각이다. `with`의 각 값은 추가 배열이며 배열들을 한 원소로 감싸 넣는 의미가 아니다. 중복 제거·필드 통합·동종 행 강제·암묵 coercion을 하지 않는다. [E49]

```json
{
  "transform": {
    "input": { "@path": "/sources/base" },
    "steps": [
      {
        "kind": "Concat",
        "with": [
          { "@path": "/sources/extra" },
          { "@path": "/sources/archive" }
        ]
      }
    ]
  }
}
```

base가 `[1]`, extra가 `[1, {"label":"x"}]`, archive가 `[null]`이면 결과는 `[1, 1, {"label":"x"}, null]`이다. 입력이나 추가 값이 배열이 아니면 Query 오류이며 빈 배열로 대체하지 않는다. **U13:** with는 필수 배열이며 빈 배열은 유효한 항등 변환이다. 호출자 원본과 과거 snapshot을 보호하되 매번 깊은 복사를 강제하지 않고 안전한 내부 구조 공유를 허용한다.

### Join 문법과 순환 참조

**확정(U13):** Join 단계는 `kind: "Join"`, `right: 동적 배열 값`, 선택적 `mode: left | right | inner`(기본 left), 필수 `on: [{left: 필드명, right: 필드명}, ...]`을 사용한다. 왼쪽은 직전 단계 입력이며 양쪽 모두 객체 행 배열이어야 한다. on은 비어 있지 않은 복합키 목록이며 필드명은 최상위 own 속성 이름이다. 점을 경로 구분자로 자동 해석하지 않는다. 키는 string·유한 number·boolean·null만 허용하고 null은 매칭하지 않는다. 누락 키는 오류이며 모든 키가 타입과 값까지 같을 때 매칭한다.

left/inner는 왼쪽 행 순서, 같은 행의 다중 매칭은 오른쪽 순서다. right는 오른쪽 행 순서, 다중 매칭은 왼쪽 순서다. 결과의 필드 충돌은 항상 오른쪽 행의 값이 덮어쓴다. 해당 mode의 미매칭 행은 원래 필드만 유지하며 없는 쪽의 필드를 null로 채우지 않는다. 입력은 수정하지 않는다. 이는 과거 제안의 사용자 승인을 복원한 것이 아닌 현재 위임에 따른 문법 확정이다. Filter/Map/Sort/Aggregate를 추가 내장 kind로 함께 확정하지 않는다.

Query 정의의 직접·간접 참조 순환은 미사용 정의까지 등록 묶음의 검증에서 거절한다. 인라인 Query 내부 참조도 포함하며, 같은 하위 Query를 두 번 참조하는 비순환 그래프는 허용한다. 참조 해석을 위한 등록 묶음 전체를 준비한 뒤 검사하며 정의 검증 중 요청을 실행하지 않는다. [U13]

### View/Component가 소유하는 Query 사용 인스턴스

```json
{
  "kind": "View",
  "id": "plant-overview",
  "spec": {
    "states": {
      "organizationId": {
        "kind": "State",
        "initial": "org-a",
        "schema": {
          "type": "string"
        }
      }
    },
    "queries": {
      "plantList": {
        "queryRef": "plants",
        "inputs": {
          "organizationId": {
            "@path": "/states/organizationId"
          }
        }
      }
    },
    "render": {
      "id": "list",
      "componentRef": "ui.Table",
      "inputs": {
        "rows": {
          "@path": "/queries/plantList/data"
        }
      }
    }
  }
}
```

`spec.queries`는 소유자 내부 이름별 사용 맵이다. /queries/plantList는 그 논리적 Query 사용 인스턴스를 가리킨다. 같은 queryRef라도 두 사용 인스턴스는 기본 분리된다. 위 ui.Table은 rows 배열을 받아 내부 반복 표시하는 예시 등록 Component이며 core 기본 리소스가 아니다. 이러한 Table 내부 렌더링에는 선언 repeat를 추가할 필요가 없다. [E35]

| 경로 | 의미 |
|---|---|
| /queries/plantList | Query 사용 인스턴스 대상 |
| /queries/plantList/data | transform을 마친 최종 Query 결과 |
| /queries/plantList/status | 읽기 전용 실행 상태 |
| /queries/plantList/error | 읽기 전용 오류 |
| /queries/plantList/dataInputs · /stale | 보유 결과의 입력 snapshot·이전 결과 여부. 뒤 경로도 /queries/plantList/stale 전체 경로 |
| /ports/list | Query 포트가 연결한 같은 사용 인스턴스 |
| /ports/list/data · /status · /error · /dataInputs · /stale | 연결된 인스턴스의 동일한 읽기 표면. 각 경로에 /ports/list 접두 적용 |

마지막 행의 /status·/error도 각각 /ports/list/status·/ports/list/error 전체 경로를 뜻한다. Query 결과가 배열이면 data 자체가 그 배열이며 원본 HTTP 응답 envelope를 추가로 강제하지 않는다. 상태와 공통 오류는 아래 U13을 따른다. Query data/status/error를 SetState로 수정할 수 없다. [E36, E37, E52, U13]

예를 들어 View가 소유한 plantList를 다른 Component/Action에 `inputs: { "list": { "@path": "/queries/plantList" } }`로 전달한다. 수신 리소스는 `list: { "kind": "Query", "required": true }` 포트를 선언하고 `/ports/list/data`로 읽는다. `{ "kind": "RefreshQuery", "target": { "@path": "/ports/list" } }`는 그 연결된 사용 인스턴스를 갱신하는 표현이다. 다른 Component의 내부 이름을 직접 탐색하는 대신 소유자가 공개 포트로 대상 연결을 제공한다.

### RefreshQuery의 완료와 실행 불가

**확정:** Query Port는 data/status/error 읽기와 갱신을 지원한다. RefreshQuery는 queryRef 정의를 새 독립 실행하는 것과 달리 연결된 사용 인스턴스의 현재 입력으로 fresh 실행을 요청하고 그 새 실행의 완료까지 기다린다. Action에서 별도 inputs로 대상의 입력을 덮어쓰지 않는다. 결과값만 필요한 소비자는 Value 포트를 사용한다. [E37, E55]

이미 요청이 진행 중이면 기존 요청이 끝난 뒤 새 요청을 실행하고, **그 새 요청의 성공·실패가 결정될 때까지** 다음 Action 단계로 진행하지 않는다. 기존 요청의 응답만으로 RefreshQuery를 성공 처리하지 않으며 동시에 요청 수를 늘리지 않는다. 기존 1 active + 1 latest pending 조정에 연결하고, 대기 결합·입력 변화 규칙은 아래 U13을 따르고 시간순 fixture로 검증한다. [E55]

executeWhen은 명시 갱신에도 적용한다. gate가 닫혀 실행할 수 없으면 이유를 오류로 전달하고 **해당 Action을 중단**한다. 뒤 단계와 정상 output은 평가하지 않으며, 조건이 열릴 때까지 호출을 보류하거나 실행하지 않은 갱신을 성공으로 처리하지 않는다. 이미 완료된 State 변경이나 외부 요청은 자동으로 되돌리지 않는다. autoRefreshWhen은 주기 갱신에만 적용하므로 수동 RefreshQuery를 차단하는 조건이 아니다. 오류 DTO는 공통 오류 계약을 따른다. [E55, E67]

**일반 자동·수동 갱신에서는 사용 인스턴스의 refresh:false 제외 정책을 존중하며 RefreshQuery도 예외가 아니다.** 이 제외 정책과 executeWhen이 닫혔을 때의 확정된 Action 중단 결과를 구별한다. [E50, E55]

refresh:false는 Query 정의를 영구 실행 금지하는 권한이 아니라 사용 인스턴스의 일반 갱신 제외 설정이다. 최초 실행·입력 변경과 일반 갱신을 동일하게 금지하는 의미로 확대하지 않는다. 사용 설정·명시 갱신·retry의 세부는 다음 U13을 따른다.

### 사용 설정·상태·대기 호출의 구체 계약

**확정(U13):** View/Component의 `spec.queryDefaults`에는 정적 refresh:boolean과 intervalMs를 둘 수 있다. queries 항목에도 같은 필드를 평탄하게 두고, 사용 위치 → 가까운 Component 기본값 → View 기본값 순으로 상속한다. refresh 기본값은 true이며 intervalMs 생략은 주기 없음이다. intervalMs는 양의 안전 정수 밀리초다. executeWhen/autoRefreshWhen은 사용 위치의 동적 boolean이며 기본 true다. 기본값 객체에 숨은 상태 참조나 새 기본 주기를 넣지 않는다.

| 관찰 필드 | 계약 |
|---|---|
| status | idle(실행 전), waiting(입력/gate 대기), running, success, error |
| data | 준비된 실제 결과. 첫 성공 전에는 missing이며 명시 null 결과와 구별 |
| dataInputs | 보유 data를 만든 완전 성공 실행의 읽기 전용 Value 입력 snapshot. data가 missing이면 함께 missing |
| error | 오류 없으면 null, 실패 시 공통 오류 |
| stale | 보유 data가 현재 조건의 유효 성공 결과가 아니면 true. data가 없으면 false |
| waitingReason | waiting일 때 INPUT_NOT_READY 또는 EXECUTION_BLOCKED, 그 밖에는 null |

입력 변경 대기 중 이전 결과를 보존할 때 stale:true를 노출한다. 실패 이후에도 아래 U14의 마지막 성공 결과 보존을 적용한다. Action 실행 관찰의 data:null 규칙을 Query data의 missing 규칙으로 바꾸는 것은 아니다.

- RefreshQuery가 refresh:false로 제외되면 QUERY_REFRESH_DISABLED로 실패하고 후속 Action을 중단한다. 실행하지 않은 요청을 성공·void 완료로 표시하지 않는다. executeWhen:false는 기존 EXECUTION_BLOCKED다.
- 같은 active 실행 중 들어온 refresh 호출들은 그 active 이후에 시작할 하나의 latest pending 실행을 기다린다. pending이 시작한 뒤 들어온 호출은 다음 fresh 실행을 기다린다. 선행 active의 성공·실패만으로 대기 호출을 완료하지 않는다.
- 대기 중 입력이 바뀌면 최신 입력으로 pending을 대체한다. 이전 입력의 완료는 대기 호출을 성공시키지 않고 현재 유효한 fresh 실행까지 연결한다. gate가 닫히면 대기 호출은 EXECUTION_BLOCKED, 소유 수명이 끝나면 CANCELLED로 끝낸다. 실제 실행 결과 오류는 같은 실행을 기다리던 호출에 전파한다.
- `QueryHandle.retry()`는 error 상태에서 현재 입력으로 명시적인 재시도 1회를 요청한다. 일반 갱신 제외 refresh:false는 우회하지만 executeWhen·입력 검증·수명·권한은 우회하지 않는다. error 상태가 아니면 INVALID_RETRY_STATE다. 자동 retry·새 Action 단계 kind·명시 Action Query의 캐시 공유를 추가하지 않는다.

위 대기 결합은 자동 Query 사용 인스턴스에만 적용한다. 독립 Action Query 호출끼리는 합치지 않는다. 시간순 경합 fixture는 구현 검증 과제로 유지한다. [U13]

U17의 [Query 경합 독립 실험](../handoff/t2-query-races-2026-10-29.md)에서 지연 성공/실패·입력 세대·fresh 대기 결합·소유 수명 교체·timeout의 대표 경로를 실행했다. 현재 계약의 프로토타입 증거다. U29의 [Query–실제 HTTP 연결 검사](../handoff/t2-query-http-2026-10-30.md)는 같은 스케줄러를 HTTP/Login 실행기에 연결해 Node 22/24 각각 39개 사례·4개 고의 결함을 확인했다. 단일 직접 source의 연결 증거이며 일반 Query DSL·복합 Query·실제 core/URL/Action/renderer 연결 완료와 구별한다.

### 완료 기준 주기 실행

**기존 계약의 실행 연결(U30):** intervalMs가 있는 사용 인스턴스는 실행의 성공·실패·timeout이 정리된 뒤 intervalMs만큼 기다려 다음 주기 실행을 예약한다. 요청 시작부터 반복 tick을 쌓거나 실패 직후 무한 재시도하지 않는다. 복합 Query에서는 일부 source 완료가 아니라 전체 실행의 완료를 기준으로 한다. 입력 변경·수동 fresh 요청의 latest pending이 이어서 시작하면 그것이 먼저 실행되고, 그 완료 뒤 다음 주기를 예약한다.

executeWhen·입력 준비·refresh·autoRefreshWhen을 주기 실행 직전에도 확인한다. autoRefreshWhen은 최초/입력 변경/수동 실행을 차단하는 조건이 아니다. 소유 수명이 끝나거나 교체되면 timer를 정리하며, 취소된 timer callback이나 이미 끝난 실행의 늦은 완료가 새로운 예약을 만들지 못하게 한다.

**재개 정책 확정(U31):** intervalMs가 설정된 사용 인스턴스에서 autoRefreshWhen이 false→true로 바뀌면, 실행 조건을 만족하는 현재 입력으로 즉시 fresh 갱신 한 번을 요청한다. 그 실행의 성공·실패·timeout 완료 뒤부터 intervalMs를 기다린다. 중단 전 마지막 완료 시각이나 남은 주기를 이어받지 않고, 중단 중 지나간 횟수만큼 보충 실행하지 않는다.

- 이미 실행 중이면 병렬로 시작하지 않고 다음 latest pending 실행 한 건으로 합친다. 대기 중 수동 갱신·입력 변경도 같은 실행에 결합하며 최신 입력과 fresh 요구를 보존한다. 복합 Query의 유효 하위 캐시만 반환하고 갱신을 생략하지 않는다.
- 같은 반영 단위에서 입력/gate/준비 상태와 재개 조건이 함께 바뀌면 한 실행으로 처리한다. true가 계속 유지되는 재평가나 최초 true 설정은 별도 재개 요청을 만들지 않는다. 최초 실행은 기존 정책을 따른다.
- executeWhen:false, 미준비 입력, refresh:false, intervalMs 생략은 재개로 우회하지 않는다. 실행할 수 없는 재개 요청을 따로 누적하지 않는다. 이후 gate/입력 준비에 따른 실행은 기존 정책을 따른다.
- false가 되면 주기 timer와 아직 시작하지 않은 주기·재개 요청만 제거한다. 같은 pending에 결합된 입력 변경·수동 호출은 유지하며, 이미 시작한 실행은 autoRefreshWhen만으로 취소하지 않는다.

U30의 [복합 Query·완료 기준 polling 검증](../handoff/t2-composite-polling-2026-10-30.md)은 하위 입력별 재사용·전체 성공 반영·source/transform 오류 위치와 위 주기 정책을 함께 확인했다. 수동/retry/주기의 fresh 실행과 입력 변경용 재사용을 구분하고, owner 폐기 때 내부 캐시도 정리했다. 독립 실험이며 전체 core·스키마·renderer 완료가 아니다.

U31의 [재개 정책 검증](../handoff/t2-polling-resume-2026-10-30.md)은 즉시 갱신·진행 중 한 건 결합·완료 후 재예약과 다시 중단할 때 다른 실행 계기의 보존을 확인했다. 마지막 완료 시각을 저장하는 U30의 임시 구현 선택은 대체했다.

### 실패 후 마지막 성공 결과의 보존

**확정(U14):** 자동 Query 사용 인스턴스는 마지막으로 **전체 실행이 성공한** data와 dataInputs를 한 쌍으로 보존한다. 새 실행이 실패하면 `status:error`, `stale:true`, 해당 실행의 error를 함께 노출한다. 한 번도 성공하지 않았다면 data와 dataInputs는 missing이고 stale:false다. null·false·0·빈 문자열·빈 배열도 성공 결과이므로 truthy 여부로 보존 유무를 판정하지 않는다.

재시도나 입력 변경으로 waiting/running이 되어도 보존한 쌍을 지우지 않는다. 입력 변경 또는 직전 실패로 stale이 된 결과는 다음 유효한 전체 성공까지 stale을 유지한다. 같은 입력의 정상 갱신 중에는 직전 성공 결과의 stale:false를 유지하며 running이 갱신 중임을 알린다. 새 실행이 실제로 시작하면 이전 error는 null로 지우고, 다음 성공에서 data·dataInputs를 원자 교체하며 stale:false·error:null로 만든다. 새 실패에서는 보존한 쌍을 유지하고 새 error를 기록한다.

현재 입력 B로 실패했는데 보존 data의 dataInputs가 A이면 화면은 이를 A의 이전 결과로 표시해야 한다. 실패하거나 stale인 data를 표시하는 서비스·렌더러는 오류/이전 결과 표시를 함께 제공하며 현재 조건의 최신 성공값으로 표시하지 않는다. dataInputs는 실제 Value 입력만 담고 Store 핸들·secret·Login 응답을 포함하지 않는다. 관찰 경로는 data와 같은 위치의 `dataInputs`·`stale`이고 QueryHandle.getSnapshot()에서도 동일하다.

보존 data는 실패를 성공으로 바꾸지 않는다. RefreshQuery/refresh/retry를 기다리는 호출은 해당 fresh 실행의 오류를 받고 후속 Action 단계는 중단된다. 명시 Action Query 호출에는 이 대체 결과를 반환하지 않는다. 실패한 실행의 일부 source 결과를 마지막 성공 snapshot에 승격하거나 이전 결과와 섞어 새 성공으로 발표하지 않는다. 입력 불변의 유효 결과 재사용은 아래 E69 범위로 유지한다.

보존 범위는 같은 Query 사용 인스턴스·정의의 수명이다. 제거·폐기·정의 교체 시 끝나며 새 인스턴스나 다른 owner에 자동 승계하지 않는다. 오래된 입력 세대·취소된 호출의 늦은 완료는 현재 data·dataInputs·status·error를 덮어쓰지 않는다. 이는 취소를 신규 조회 실패로 표시하라는 의미가 아니며 기존 gate·수명 정책을 따른다.

## 실행 정책 이관

자동 조회 인스턴스의 executeWhen/autoRefreshWhen·1 active + 1 latest pending·완료 기준 주기·generation/snapshot 유효성은 [이전 승인 이관](09-preserved-contracts.md)을 따른다. 이를 명시 Action Query 호출에 자동 구독·캐시 공유·재시도를 추가하는 근거로 사용하지 않는다. Query 상태는 U13, 실패 후 data 정책은 위 U14를 따른다.

### 자동 조회 결합의 입력 변경 대기

자동 조회 사용 인스턴스에서 여러 Query 결과를 결합할 때, 입력 변경으로 다시 조회해야 하는 결과들이 준비된 뒤 결합 결과를 갱신한다. **입력이 바뀌지 않아 현재 조건에도 유효한 결과는 재사용**한다. 새 A와 옛 조건의 B를 섞지 않는다는 원칙이 모든 입력의 결과를 무조건 버리고 재조회한다는 뜻은 아니다. [E69]

기존 결합 결과가 있으면 기다리는 동안 **이전 결과임을 구별할 수 있는 갱신 중 상태로 유지**한다. 이전 조합을 새 조건의 성공값으로 가장하지 않는다. 기다림의 범위는 관련된 결합 안이며 무관한 Query나 화면 전체를 묶어 멈추지 않는다. U13/U14의 status·stale·dataInputs로 구별한다. [E69]

E69의 입력 변경 대기 중 보존과 E52의 전체 실패 의미를 유지하며, 실패 후에는 U14의 마지막 전체 성공 snapshot 보존을 적용한다. 명시 Action Query 호출의 캐시 대체·실행 공유 금지를 취소하는 근거로 사용하지 않는다.
