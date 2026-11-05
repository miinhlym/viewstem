---
title: HTTP Datasource
description: 공통 HTTP 설정, 요청 필드, 비밀 참조와 Login 토큰 추출을 설명합니다.
sidebar:
  order: 6
---

## DatasourceSpec

Datasource는 HTTP 소스의 공통 설정을 정의합니다. 소스는 `datasourceRef` 또는 인라인 `datasource`를 선택하고 자체 `request`를 지정합니다.

| 필드 | 계약 |
| --- | --- |
| `kind` | 필수 리터럴 `"Http"`. |
| `baseUrl` | 절대 HTTP 또는 HTTPS 기본 URL을 반환하는 필수 표현식. 사용자 정보, 쿼리 문자열, 프래그먼트는 허용하지 않습니다. |
| `headers`, `params` | 공통 헤더와 URL 파라미터의 일반 객체를 반환하는 선택적 표현식. |
| `secrets` | 별칭을 비어 있지 않은 비밀 참조 문자열에 연결하는 선택적 맵. 서버가 참조에서 실제 값을 찾습니다. |
| `auth` | `kind: "Login"`, 필수 `request`, 필수 `token` 표현식이 담긴 선택적 객체. |

## HttpRequest

| 필드 | 계약 |
| --- | --- |
| `method` | `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` 중 하나를 반환하는 필수 표현식. |
| `path` | 기본 URL의 기존 경로 뒤에 붙일 경로를 반환하는 필수 표현식. 앞에 슬래시를 붙일 수 있습니다. 스킴, 네트워크 경로, 쿼리 문자열, 프래그먼트, 상위 경로 이탈은 거절합니다. |
| `baseUrl` | 선택적 덮어쓰기. 이 필드가 생략된 경우에만 Datasource 기본값을 평가합니다. |
| `headers` | 선택적 객체 표현식. 키는 대소문자를 구분하지 않고 병합하며 요청 설정이 우선합니다. 허용된 공통 헤더를 제거하려면 값에 null을 씁니다. |
| `params` | 선택적 객체 표현식. 요청 키가 같은 철자의 기본값을 덮어씁니다. 값은 문자열, 유한 숫자, 불리언 또는 그 배열입니다. 배열은 키를 순서대로 반복합니다. null과 빈 배열은 키를 생략하며 빈 문자열은 `name=`으로 인코딩합니다. |
| `body` | 선택적 표현식. GET과 HEAD에는 허용되지 않습니다. 기본적으로 문자열은 UTF-8 텍스트, 그 밖의 JSON 값은 JSON으로 보냅니다. 명시적 JSON 미디어 타입은 문자열과 null을 포함한 JSON 값을 직렬화합니다. 폼 인코딩은 params와 같은 객체 형식을, `text/*`는 문자열을 받습니다. |

각 헤더 선언을 병합 전에 검사합니다. 이름은 HTTP 토큰 문법을 사용하고 대소문자만 다른 중복 키는 오류입니다. 값은 문자열 또는 null이며 탭과 코드 포인트 U+0020~U+007E 또는 U+0080~U+00FF만 받습니다. 앞뒤 공백과 탭은 제거합니다. 기본 실행기는 다음 이름과 접두사를 예약하므로 값이 null이어도 선언할 수 없습니다.

- `Accept-Charset`, `Accept-Encoding`, `Access-Control-Request-Headers`, `Access-Control-Request-Method`, `Connection`, `Content-Length`, `Cookie`, `Cookie2`, `Date`, `DNT`, `Expect`, `Host`, `Keep-Alive`, `Origin`, `Referer`, `Set-Cookie`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`, `Via`
- `Proxy-*`, `Sec-*`, `User-Agent`, `X-HTTP-Method`, `X-HTTP-Method-Override`, `X-Method-Override`

## 표현식 문맥

| 위치 | 사용 가능한 값 |
| --- | --- |
| 요청 및 Login의 주소 또는 메서드 | Query의 `/ports`. 실제 요청에서는 Login 후 `/auth/token`을 쓸 수 있습니다. 목적지를 계산할 때는 비밀값을 조회할 수 없습니다. |
| 요청의 헤더, 파라미터, 본문 | Query의 `/ports`, 권한을 확인한 `/secrets/<별칭>`, Login 후 `/auth/token`. |
| Login의 헤더, 파라미터, 본문 | Query의 `/ports`, 권한을 확인한 `/secrets/<별칭>`. |
| `auth.token` | `status`, `headers`, `body`가 있는 Login의 `/response`만 사용합니다. |

Login은 생략 시 사용할 `baseUrl`만 상속합니다. 표현식 필드를 가진 요청 객체 또는 전체 요청 객체를 가리키는 경로를 받습니다. 경로가 반환한 요청 객체는 필드를 다시 평가하지 않고 데이터로 사용합니다. 기본 실행기는 HTTP 표현식에서 `concat`과 `formatString`을 지원합니다. 레지스트리에 등록한 값 함수는 이를 둘러싼 View나 Query에 적용되고 HTTP 표현식은 별도 실행기에서 평가합니다. 추출한 토큰은 비어 있지 않은 문자열이어야 하며 ASCII 공백과 제어 문자를 포함할 수 없습니다. 매 실행에서 별도로 Login을 실행하며, Login이 실패하면 실제 데이터 요청을 시작하지 않습니다.

다음 QuerySpec은 Login JSON 응답에서 토큰을 읽어 데이터 요청에 사용합니다. 두 목적지를 허용하는 인가 함수와 `projects/service-key`를 자격 증명으로 해석하는 비밀 조회 함수를 가진 신뢰된 실행기에서 실행하세요.

```json title="login-query.json"
{
  "sources": {
    "projects": {
      "datasource": {
        "kind": "Http",
        "baseUrl": "https://example.test/api",
        "secrets": { "serviceKey": "projects/service-key" },
        "auth": {
          "kind": "Login",
          "request": {
            "method": "POST",
            "path": "/login",
            "headers": { "X-API-Key": { "@path": "/secrets/serviceKey" } }
          },
          "token": { "@path": "/response/body/accessToken" }
        },
        "headers": {
          "Authorization": { "@call": "concat", "args": ["Bearer ", { "@path": "/auth/token" }] }
        }
      },
      "request": { "method": "GET", "path": "/projects", "params": { "tag": ["open", "active"] } }
    }
  },
  "transform": { "input": { "@path": "/sources/projects" } }
}
```

## 실행 경계

기본 실행기는 2xx 응답을 받아 JSON과 텍스트 미디어 타입을 읽으며 HEAD, 204, 205의 본문은 null로 반환합니다. 리디렉션, 멀티파트나 바이너리처럼 지원하지 않는 본문, 지원하지 않는 응답 미디어 타입, 잘못된 JSON은 거절합니다. Login과 실제 요청은 실행 계획의 시간 제한을 공유합니다. 비밀 참조나 Login이 있는 계획에는 신뢰된 `authorize` 함수가 필요하며, 전송 전에 각 요청의 목적지와 최종 URL을 검사합니다. 실제 자격 증명은 서버의 비밀 저장소에 둡니다. 옵션과 시간 제한, 실행 계획과 응답 타입은 [HTTP 실행기](/ko/docs/core/http/)를 참고하세요.
