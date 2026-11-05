---
title: Query와 데이터
description: Query 인스턴스로 데이터를 읽고 변환하며 실행 상태를 관찰합니다.
---

**Query**는 데이터 출처와 결과를 만드는 방법을 정의합니다. View나 Component는 `queries`에 Query 사용을 선언하고 `/queries/이름/data`로 결과를 읽습니다.

## 결과 읽기

먼저 서버 없이 동작하는 View로 살펴봅니다. Query는 source 없이 **Projects**라는 값을 결과로 만듭니다.


```json
{
  "queries": {
    "projects": {
      "query": {
        "sources": {},
        "transform": {
          "input": "Projects"
        }
      }
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/queries/projects/data"
      }
    }
  }
}
```


`projects`는 이 Query 인스턴스의 로컬 이름입니다. `query`에 정의를 넣고 `transform.input`으로 `data`가 될 값을 선택합니다. Query가 완료되면 배지에 **Projects**가 표시됩니다.

## HTTP source에서 읽기

HTTP 요청에서는 **Datasource**가 연결 설정을, source가 실행할 요청을 제공합니다. 아래 View의 예시 URL을 `{ "title": "Projects" }`를 반환하는 접근 가능한 API로 바꿔 사용합니다.


```json
{
  "queries": {
    "projects": {
      "query": {
        "sources": {
          "main": {
            "datasource": {
              "kind": "Http",
              "baseUrl": "https://example.test"
            },
            "request": {
              "method": "GET",
              "path": "/projects"
            }
          }
        },
        "transform": {
          "input": {
            "@path": "/sources/main/title"
          }
        }
      }
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/queries/projects/data"
      }
    }
  }
}
```


`main`은 source 이름입니다. Query 안에서는 `/sources/main/title`로 응답 필드를 읽고, View에서는 `/queries/projects/data`로 변환된 결과를 읽습니다. 다른 Query를 source로 사용하거나 `Concat`, `Join`으로 결과를 결합할 수도 있습니다.

브라우저에서 접근 가능한 공개 요청은 직접 실행할 수 있습니다. 비밀 인증정보가 필요한 요청은 신뢰할 수 있는 서버 연동을 거쳐 실행하며, 브라우저로 전달하는 View와 Datasource JSON에는 실제 비밀값을 넣지 않습니다.

## 대기와 실패 구분하기

| 관찰값 | 의미 |
|---|---|
| `status` | `idle`, `waiting`, `running`, `success`, `error` 중 현재 상태 |
| `waitingReason` | 입력 미준비 또는 실행 조건 차단의 이유 |
| `data` | 마지막 전체 성공 결과. 첫 성공 전에는 값이 없음 |
| `error` | 실행 실패의 상세 정보 |
| `stale` | 표시하는 데이터가 현재 실행 조건에 맞는 최신 결과가 아님 |

이 값들은 `/queries/projects` 아래에서 읽습니다. 필요한 source나 transform이 실패하면 Query 전체가 실패합니다. 자동 갱신 실패 시 마지막 전체 성공 데이터는 보존하고 오류와 `stale: true`를 노출하므로, 화면에서도 이전 결과임을 표시해야 합니다. 정상적으로 조회한 빈 결과는 오류와 다릅니다.

## 실행 시점 정하기

Query의 `inputs`로 선언된 포트에 State 등의 값을 연결합니다. 실행 가능한 Query는 입력 변경에 반응합니다. `executeWhen`은 실행 조건을, `intervalMs`와 `autoRefreshWhen`은 주기적 갱신을 제어합니다. Action의 `RefreshQuery` 단계는 Query 포트로 기존 인스턴스를 연결받아 새 요청이 완료될 때까지 기다립니다.

서버 데이터를 변경하는 요청은 Action의 Query 단계에서 명시적으로 실행합니다. 생성이나 수정 요청을 자동 조회 흐름에 넣지 않고 의도한 동작에 연결할 수 있습니다. 같은 Query 정의를 참조한다고 인스턴스나 결과가 자동 공유되지는 않습니다.

[HTTP 예제](../../../examples/http-datasource/)는 모의 응답을 사용하므로 API 서버 없이 이 흐름을 확인할 수 있습니다.

실행 조건, 수동 갱신과 주기 설정의 필드·기본값은 [Query 레퍼런스](../../dsl/queries/)에서 확인하세요.
