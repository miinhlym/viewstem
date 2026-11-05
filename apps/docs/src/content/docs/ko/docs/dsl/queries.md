---
title: Query
description: Query의 소스와 변환, 사용 설정, 스냅샷, 갱신 규칙을 설명합니다.
sidebar:
  order: 5
---

## QuerySpec

| 필드 | 계약 |
| --- | --- |
| `ports` | 선택적 Value 포트 맵. |
| `sources` | 이름별 QuerySource 객체 맵. 필수이며 소스가 필요 없으면 `{}`를 사용합니다. |
| `transform` | 필수 객체. `input` 표현식과 선택적 순차 `steps` 배열을 받습니다. 마지막 변환 결과가 Query 결과가 되며 단계가 없으면 `input`이 결과입니다. |

## QuerySource

| 소스 | 필드 | `/sources/<이름>`의 값 |
| --- | --- | --- |
| 중첩 Query | `queryRef`와 `query` 중 하나, 상위 Query의 `/ports`를 읽을 수 있는 선택적 `inputs`. | 중첩 Query의 변환 결과. |
| HTTP | `datasourceRef`와 `datasource` 중 하나, 필수 `request`. 요청은 현재 Query의 포트를 읽습니다. | 응답 본문. |

중첩 Query는 입력 객체 전체를 반환하는 표현식도 받습니다. null은 허용하지 않습니다. 소스에서 다른 소스의 결과를 읽을 수 없습니다. 결과는 변환에서 결합합니다. 레지스트리는 중첩 Query 정의의 순환을 거절합니다. 필요한 모든 소스와 변환 단계가 성공해야 합니다. 실패에는 소스나 변환 위치가 담기며, 중첩 오류는 `cause`에 원래 위치를 보존할 수 있습니다. 빈 배열도 성공 결과가 될 수 있습니다. [HTTP Datasource](/ko/docs/dsl/datasources/)를 참고하세요.

## TransformStep

`input`, `Concat.with`, `Join.right`의 표현식은 `/ports`와 `/sources`를 읽을 수 있습니다. 직전 결과는 각 단계의 왼쪽 피연산자가 됩니다.

| 종류 | 필드 | 동작 |
| --- | --- | --- |
| `Concat` | 필수 `with`. 각각 배열을 반환하는 표현식의 배열입니다. | 현재 배열 뒤에 원소를 순서대로 붙입니다. 중복을 유지하며 `with`가 비어 있으면 현재 배열을 유지합니다. |
| `Join` | 필수 `right`와 `{ "left": "필드", "right": "필드" }` 쌍의 비어 있지 않은 `on` 배열. 선택적 `mode`는 `left`(기본), `right`, `inner` 중 하나입니다. | 객체 행 배열에서 최상위 자체 필드로 결합합니다. 모든 키 쌍의 타입과 값이 일치해야 합니다. 키 누락은 오류이며 null 키는 매칭되지 않습니다. |

결합 키는 문자열, 유한 숫자, 불리언, null입니다. 필드 이름 안의 점은 문자 그대로 사용합니다. left와 inner는 왼쪽 행 순서를 따르고, 다중 매칭은 오른쪽 행 순서를 따릅니다. right는 그 우선순위를 뒤집습니다. 같은 필드가 양쪽에 있으면 오른쪽 값이 우선합니다. 매칭되지 않은 행에는 반대쪽 필드를 추가하지 않습니다.

다음 QuerySpec의 결과는 `[{"id":"a","projectId":"a","open":true},{"id":"b"}]`입니다. HTTP 소스가 없으므로 요청 실행기가 필요하지 않습니다.

```json title="join-query.json"
{
  "sources": {},
  "transform": {
    "input": [{ "id": "a" }, { "id": "b" }],
    "steps": [
      {
        "kind": "Join",
        "right": [{ "projectId": "a", "open": true }],
        "on": [{ "left": "id", "right": "projectId" }]
      }
    ]
  }
}
```

## QueryUse and QueryDefaults

QueryUse는 View나 Component의 `queries` 맵 항목입니다. `queryRef` 또는 `query` 중 하나를 사용하고 `inputs`를 선택적으로 전달합니다. 같은 정의를 사용하는 항목도 수명은 각각 독립적입니다.

| 필드 | 기본값과 적용 범위 |
| --- | --- |
| `refresh` | 불리언이며 새 사용의 기본값은 true입니다. false이면 주기 갱신과 일반 수동 갱신에서 제외합니다. 최초 실행과 유효한 입력 변경 시 실행은 계속 적용됩니다. |
| `intervalMs` | 새 사용에 간격을 지정하지 않으면 주기 갱신이 없습니다. 지정 시 밀리초 단위의 양의 안전 정수입니다. |
| `executeWhen` | 기본값 true인 엄격한 불리언 표현식. 자동 실행과 명시적 갱신 및 재시도에 적용합니다. |
| `autoRefreshWhen` | 기본값 true인 엄격한 불리언 표현식. 주기 갱신에만 적용합니다. |

`queryDefaults`에는 정적 `refresh`와 `intervalMs`만 둘 수 있습니다. 필드별 우선순위는 사용 설정, 가장 가까운 Component 기본값, View 기본값 순입니다. 주기는 실행 완료를 기준으로 계산하므로 타이머로 여러 요청이 겹치지 않습니다. 주기 갱신이 가능한 상태에서 게이트를 다시 열면 새 실행을 예약합니다. `RefreshQuery`는 새 실행을 기다립니다. 진행 중인 실행이 있으면 여러 갱신 호출이 최신 입력으로 실행되는 다음 요청 하나를 함께 기다릴 수 있습니다. 갱신은 `QUERY_REFRESH_DISABLED`, `EXECUTION_BLOCKED`, 입력 또는 요청 오류로 실패할 수 있습니다.

현재 View 업데이트에서 유지되는 Query 사용은 필드를 생략하고 상속 설정도 없으면 기존 `refresh` 또는 `intervalMs`를 유지합니다. 새 View 수명에서는 위 기본값을 적용합니다.

## QuerySnapshot

`/queries/<이름>/<필드>` 또는 Query 포트에 연결한 `/ports/<이름>/<필드>`에서 스냅샷 필드를 읽습니다.

| 필드 | 의미 |
| --- | --- |
| `status` | `idle`, `waiting`, `running`, `success`, `error` 중 하나. |
| `data`, `dataInputs` | 마지막 완전 성공 결과와 그때 사용한 Value 입력 스냅샷. 첫 성공 전에는 둘 다 누락 상태입니다. |
| `error` | 현재 실패의 공개 오류 또는 null. |
| `stale` | 보관한 데이터가 현재 실행 조건보다 오래된 결과이면 true입니다. 갱신 실패 후에도 적용됩니다. |
| `waitingReason` | 대기 중이면 `INPUT_NOT_READY` 또는 `EXECUTION_BLOCKED`, 그 외에는 null. |

화면 예제는 [Query와 데이터](/ko/docs/concepts/queries-and-data/), 명시 실행은 [Action 단계](/ko/docs/dsl/actions/#단계), 호스트 코드에서의 갱신과 재시도는 [View API](/ko/docs/core/view/)를 참고하세요.
