# Datasource · HTTP · 인증

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**예시 해석:** 아래 발전소·날씨·협력사 등의 명칭은 이전 논의의 설명용 예시다. `example.com` 계열 주소와 임의 ID만 사용하며 실제 회사 API·비밀값·기본 등록 리소스가 아니다. core는 이 도메인에 의존하지 않는다.

## 10.1 Datasource와 HTTP 인증 구성

**확정 범위:** 1차 Datasource의 spec.kind는 Http다. spec 내부는 다시 spec으로 감싸지 않는다. baseUrl은 요청 주소의 공통 기준이며, headers·params·secrets·auth는 필요할 때만 선언한다. 비밀값은 공통 secrets 선언과 @path로 사용하고, API Key·Bearer는 headers 또는 params에서 직접 구성한다. auth.kind는 1차에 Login만 둔다. [E28]

| 필드 | 의미 | 현재 범위 |
|---|---|---|
| spec.kind | 데이터 접근 구현 종류 | Http |
| spec.baseUrl | 실제 데이터 요청의 공통 기준 URL | 필수 |
| spec.headers | 실제 데이터 요청의 공통 헤더 | 선택 |
| spec.params | 실제 데이터 요청의 공통 URL 파라미터 | 선택 |
| spec.secrets | 로컬 별칭 → 서비스 서버가 해석할 비밀값 참조 | 선택. 실제 비밀값 저장 금지 |
| spec.auth | 실제 요청 전에 토큰을 얻는 인증 과정 | 선택. 1차 Login |
| auth.request | 독립된 로그인 HTTP 요청 | Login에서 사용 |
| auth.token | 로그인 응답에서 토큰을 추출하는 @path 표현식 | Login에서 사용 |

**10월 26일 추가 확정:** Datasource 공통 headers·params에 Query 요청의 같은 키가 있으면 Query 값이 우선한다. 인증 처리에서 만든 값도 이 병합 규칙의 대상이다. baseUrl의 공통 경로는 유지하고 request.path를 슬래시 경계에서 이어 붙인다. 실제 인증정보 사용·목적지 권한 검사는 별도로 유지한다. 문자열 조합 @call은 [동적 값 평가 프로필](10-value-contracts.md#동적-값-평가-프로필)의 U13을 따른다.

## 10.1.1 인증정보 주입 없는 공개 API

```json
{
  "kind": "Datasource",
  "id": "plant-api",
  "name": "공개 발전소 API",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://api.example.com/",
    "headers": {
      "Accept": "application/json"
    }
  }
}
```

auth·secrets를 선언하지 않는 공개 API 예시다. host 정책과 네트워크 환경이 허용하면 클라이언트에서 직접 조회할 수 있다. headers도 필요 없으면 생략할 수 있다. auth 생략 자체가 브라우저 쿠키 전송 정책이나 클라이언트 직접 실행을 보장하지는 않는다.

## 10.1.2 API Key를 요청 헤더에 전달

```json
{
  "kind": "Datasource",
  "id": "weather-api-header",
  "name": "날씨 API 헤더 인증",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://weather.example.com/",
    "secrets": {
      "apiKey": "weather-api-key"
    },
    "headers": {
      "Accept": "application/json",
      "X-API-Key": {
        "@path": "/secrets/apiKey"
      }
    }
  }
}
```

API Key 전용 kind 없이 실제 전송 위치인 headers에 바인딩한다. weather-api-key는 실제 키가 아니라 서비스 서버가 해석할 참조다.

## 10.1.3 API Key를 URL 파라미터에 전달

```json
{
  "kind": "Datasource",
  "id": "weather-api-param",
  "name": "날씨 API URL 파라미터 인증",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://weather.example.com/",
    "secrets": {
      "apiKey": "weather-api-key"
    },
    "headers": {
      "Accept": "application/json"
    },
    "params": {
      "api_key": {
        "@path": "/secrets/apiKey"
      }
    }
  }
}
```

params는 URL의 물음표 뒤에 붙는 공통 쿼리 파라미터다. Query 리소스를 뜻하지 않는다. 실제 요청 URL에 api_key가 포함되므로 대상 서버·프록시 등의 URL 로그에 남을 위험이 있다. API가 이 방식을 요구할 때 사용하며 서버의 사용·목적지 정책을 따른다.

## 10.1.4 기존 토큰을 Bearer 헤더로 전달

```json
{
  "kind": "Datasource",
  "id": "plant-api-bearer",
  "name": "발전소 API Bearer 인증",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://api.example.com/",
    "secrets": {
      "token": "plant-api-token"
    },
    "headers": {
      "Accept": "application/json",
      "Authorization": {
        "@call": "concat",
        "args": [
          "Bearer ",
          {
            "@path": "/secrets/token"
          }
        ]
      }
    }
  }
}
```

Bearer 기능을 제거하는 것이 아니라 일반 헤더 구성으로 표현한다. 토큰 참조는 /secrets/token이다. 이 예시의 concat과 args 배열은 U13에서 확정한 문자열 결합 함수 프로필을 따른다.

## 10.1.5 별도 로그인 서버에서 얻은 토큰을 Bearer로 전달

```json
{
  "kind": "Datasource",
  "id": "partner-api-bearer",
  "name": "협력사 API 로그인 후 Bearer",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://api.partner.example.com/",
    "secrets": {
      "email": "partner-login-email",
      "password": "partner-login-password"
    },
    "auth": {
      "kind": "Login",
      "request": {
        "baseUrl": "https://auth.partner.example.com/",
        "method": "POST",
        "path": "login",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "email": {
            "@path": "/secrets/email"
          },
          "password": {
            "@path": "/secrets/password"
          }
        }
      },
      "token": {
        "@path": "/response/body/data/accessToken"
      }
    },
    "headers": {
      "Accept": "application/json",
      "Authorization": {
        "@call": "concat",
        "args": [
          "Bearer ",
          {
            "@path": "/auth/token"
          }
        ]
      }
    }
  }
}
```

로그인은 auth.partner.example.com에, 실제 데이터 요청은 api.partner.example.com에 보낸다. 로그인 응답 본문의 data.accessToken을 추출해 /auth/token에 보관한다. 이 값은 서버의 요청 실행 내부 값이며 UI 상태나 Query 데이터로 반환하지 않는다. concat 호출 표기는 10.1.4와 동일한 초안이다.

## 10.1.6 같은 서버에서 얻은 토큰을 사용자 정의 헤더로 전달

```json
{
  "kind": "Datasource",
  "id": "partner-api-header",
  "name": "협력사 API 로그인 후 헤더",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://api.partner.example.com/",
    "secrets": {
      "email": "partner-login-email",
      "password": "partner-login-password"
    },
    "auth": {
      "kind": "Login",
      "request": {
        "method": "POST",
        "path": "login",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "email": {
            "@path": "/secrets/email"
          },
          "password": {
            "@path": "/secrets/password"
          }
        }
      },
      "token": {
        "@path": "/response/body/data/accessToken"
      }
    },
    "headers": {
      "Accept": "application/json",
      "X-Access-Token": {
        "@path": "/auth/token"
      }
    }
  }
}
```

auth.request.baseUrl을 생략했으므로 로그인 요청도 Datasource.baseUrl을 사용한다. 토큰의 적용 위치는 X-Access-Token 헤더로 직접 선언한다. 별도 apply 객체는 없다.

## 10.1.7 같은 서버에서 얻은 토큰을 URL 파라미터로 전달

```json
{
  "kind": "Datasource",
  "id": "partner-api-param",
  "name": "협력사 API 로그인 후 URL 파라미터",
  "spec": {
    "kind": "Http",
    "baseUrl": "https://api.partner.example.com/",
    "secrets": {
      "email": "partner-login-email",
      "password": "partner-login-password"
    },
    "auth": {
      "kind": "Login",
      "request": {
        "method": "POST",
        "path": "login",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": {
          "email": {
            "@path": "/secrets/email"
          },
          "password": {
            "@path": "/secrets/password"
          }
        }
      },
      "token": {
        "@path": "/response/body/data/accessToken"
      }
    },
    "headers": {
      "Accept": "application/json"
    },
    "params": {
      "access_token": {
        "@path": "/auth/token"
      }
    }
  }
}
```

Login으로 얻은 토큰도 /auth/token을 params에서 읽어 적용한다. 기존 ApiKey의 in: query가 나타냈던 URL 파라미터 적용을 같은 값 문법으로 표현한 것이다. URL 토큰 노출·로그 위험은 10.1.3과 동일하다.

## 10.1.8 공통 값 문법과 서버 전용 평가 문맥

같은 @path 문법을 쓰되 모든 경로를 모든 곳에서 읽을 수 있게 만들지는 않는다.

| 경로 | 제공되는 문맥 | 노출 경계 |
|---|---|---|
| /secrets/별칭 | 해당 리소스의 서버 요청 평가 | 선언된 별칭만 사용. 화면·일반 State·Variable에 제공하지 않음 |
| /response/body/... | Login 응답에서 auth.token을 평가하는 단계 | 로그인 응답은 일반 Query 결과로 반환하지 않음 |
| /auth/token | Login 완료 후 실제 데이터 요청 구성 | 서버 요청 내부 값. 클라이언트·에이전트 컨텍스트에 반환하지 않음 |
| /ports/... 및 /states/... | 각 리소스의 기존 일반 실행 문맥 | 기존 공개·소유·입력 규칙 유지 |

Login 실행 순서는 **로그인 요청 → 응답에서 문자열 토큰 추출 → 실제 요청의 headers·params 구성 → 실제 요청 실행**이다. 로그인 요청에는 아직 /auth/token이 없으며, 바깥 Datasource의 headers·params·auth를 자동 상속하지 않는다. auth.request.baseUrl만 생략 시 Datasource.baseUrl을 사용한다. 로그인 요청의 HTTP path와 @path 값 참조는 서로 다른 개념이다.

**auth.token의 읽기 문맥(U22):** auth.token 평가는 해당 호출의 Login 응답인 `/response`만 읽는다. `/secrets`, `/ports`, `/states`, `/auth`, 다른 호출의 응답에는 접근할 수 없다. 허용된 순수 함수의 인자나 중첩 표현에서도 같은 제한을 유지한다. 요청 구성 평가에 제공하는 secret resolver 권한을 토큰 추출 단계에 전달하지 않으며, 빈 목적지를 넣어 resolver를 호출하는 대체 경로도 두지 않는다. 금지된 루트 참조는 REFERENCE_NOT_FOUND로 거절하고 그 평가로 인한 secret 조회·후속 API 요청을 시작하지 않는다. 경로 문법은 기존 JSON Pointer 계약을 따르며 잘못된 문법은 INVALID_EXPRESSION이다. 정상 Login 응답의 문자열 토큰 추출과 요청 단계의 승인된 secret 사용은 유지한다.

secrets 맵은 별칭을 서버 참조와 연결하는 선언이고 실제 값을 가지는 전역 저장소가 아니다. Query·Action이 직접 비밀값을 필요로 하는 요청 실행에도 같은 선언·읽기 원칙을 적용한다. 다만 Datasource의 별칭을 모든 Query·Action에 전역 공개하거나 임의로 병합하지 않는다. 각 리소스의 실행 범위와 서버 전달 계약을 명시적으로 연결해야 한다. 이 원칙 때문에 새 Secret 독립 리소스를 추가하지 않는다.

시크릿을 처리하는 @call은 서버에서 허용된 순수 함수에 한정한다. 비밀값을 임의 사용자 콜백에 전달하거나 클라이언트에서 평가하지 않는다. 참조 누락·로그인 실패·유효한 문자열 토큰 추출 실패 시 실제 요청을 진행하지 않는다. 실행기 내부의 비밀값·Login 응답·추출 토큰을 일반 결과·디버깅 출력·에이전트 컨텍스트에 덧붙이지 않는 경계를 유지한다. 클라이언트 선언은 사용 허가증이 아니므로 서버는 호출자의 비밀값 사용 권한과 실제 목적지를 확인한다.

### 비밀정보의 책임 경계

**확정(U21, 2026-10-30):** API가 자신의 응답에 포함한 데이터의 노출은 API 책임이다. API 응답을 파싱·전달하는 동작과 Viewstem이 내부 인증정보를 직접 노출하는 동작을 구별한다.

| 책임 주체 | 책임 범위 |
|---|---|
| API 서버 | 최종 데이터 응답 body·headers에 무엇을 포함할지 결정. 요청에서 받은 credential을 응답으로 되돌려준 경우도 API의 데이터 노출 책임 |
| Viewstem 실행기 | 내부 secret·Login 응답·추출 토큰을 공개 결과·오류·로그에 임의로 붙이지 않음. 단계별 평가 문맥을 분리하고, 신뢰 문맥의 권한·목적지 검사를 실행하며 거절된 전송과 자동 redirect 추종을 막음 |
| 호스트 서비스 | secret 저장·해석 및 호출자/목적지/경로의 사용 권한 정책 구현. 클라이언트 계획의 caller·권한 주장을 신뢰하지 않고 신뢰할 수 있는 서버 문맥을 제공 |

Viewstem 기본 실행기는 API 응답에서 secret과 같은 문자열을 찾아 자동 마스킹하거나 응답 전체를 거절하지 않는다. 일반 HTTP·값 계약에 맞는 API 응답은 그대로 전달한다. 서비스가 별도 응답 필터를 두는 것은 가능하지만 core 기본 계약은 아니다. 이는 내부 인증정보·Login 응답을 반환해도 된다는 뜻이 아니며, Login 응답은 최종 데이터 API 응답과 구별해 호출 안에서만 사용한다. 허용 목적지·경로를 우회한 credential 전송도 API 책임으로 넘기지 않는다.

## 10.1.9 1차 범위와 후속 검토

- **1차 포함:** 인증정보 주입 없음, 기존 API Key의 헤더/URL 파라미터 적용, 기존 Bearer 토큰 적용, Login으로 얻은 문자열 토큰을 Bearer/사용자 정의 헤더/URL 파라미터로 적용.

- **1차에 별도 kind를 두지 않음:** Bearer·ApiKey·None. 인증 기능 삭제가 아니라 공통 값 바인딩으로 표현한다.

- **1차 추가하지 않음:** OAuth 리다이렉트·refresh, MFA·브라우저 로그인·쿠키 세션, 임의 복수 인증 워크플로, 토큰 캐시. Login은 선행 요청으로 토큰을 얻는 제한된 과정이며 모든 로그인 지원을 뜻하지 않는다.

- **기존 HTTP 실행 요구 유지:** 로그인 요청의 독립성, 리다이렉트 자동 추종 금지, 로그인 결과를 호출 내부에 보관한다는 경계를 유지한다. 예시의 POST는 로그인 요청 예시이며 Action의 HTTP 메서드 범위를 제한하지 않는다.

- **병합 확정:** Datasource headers·params → 요청 headers·params 순으로 키별 적용하고 요청 값이 우선한다. auth에서 만든 헤더·파라미터도 포함한다. 비밀값을 쓴다는 이유만으로 덮어쓰기 불가라고 간주하지 않는다. 이것이 서버의 비밀정보 사용·허용 목적지 검사를 우회하는 것은 아니다.

- **주소 결합 확정:** baseUrl에 포함된 공통 경로를 보존하고 요청 path를 슬래시 경계에서 이어 붙인다. 예를 들어 `https://api.example.com/v1`과 `/plants`는 `/v1/plants` 경로다. URL의 루트로 바꿔 공통 경로를 지우지 않는다. Query 및 Login 요청의 허용 목적지 검증은 유지한다.

- **표현 세부 확정(U13):** 위 문자열 concat/args 배열은 현재 공통 함수 프로필과 일치한다. 함수의 서버 문맥·비밀값 제한은 유지한다.

## HTTP 전송 프로필과 현재 요청 DTO

**확정(U13):** 과거 10/23 회고만으로 최초 승인을 추정하지 않는다. 아래는 이번 판단 위임에 따라 새로 선택한 v1 세부이며, 요청 우선 병합·공통 경로 보존·서버 비밀값 경계는 기존 계약을 유지한다.

| 항목 | v1 계약 |
|---|---|
| method·주소 | method는 GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS의 대문자 문자열. baseUrl은 절대 http(s) URL이며 userinfo·query·fragment를 두지 않음. path는 상대 경로로 공통 경로 뒤에 결합. 절대 URL·네트워크 경로·query/fragment·상위 경로 이탈은 오류 |
| headers | 키는 대소문자를 무시하고 병합하며 같은 선언 안의 대소문자만 다른 중복 키는 오류. 값은 문자열 또는 null. 허용 헤더의 null은 명시적 제거. 전송 계층 관리 헤더는 아래 U20 규칙으로 병합 전에 거절. CR/LF 등 잘못된 헤더는 오류 |
| params | 각 선언은 평가 후 키별 값을 담은 객체여야 하며 배열 자체를 객체로 바꾸지 않음. 각 값은 문자열·유한 숫자·boolean 또는 그 배열. 키의 대소문자는 구별. null·빈 배열은 전송 생략, 빈 문자열은 name=으로 보존. 배열은 같은 키를 반복하고 순서를 유지. 중첩 객체·컬렉션·배열 원소 null은 오류 |
| body | 생략은 본문 없음. Content-Type 생략 시 문자열은 UTF-8 text/plain, 그 밖의 JSON 값은 application/json. 명시 application/json 또는 +json은 문자열을 포함해 JSON 직렬화. null은 JSON null이며 생략 아님 |
| form·기타 | application/x-www-form-urlencoded는 params와 같은 값 프로필로 인코딩. 명시 text/*는 문자열만 허용. multipart·바이너리·기타 media type은 v1 기본 HTTP 실행기에서 지원하지 않으며 오류. GET/HEAD의 body도 오류 |
| 응답 | 2xx만 성공, 3xx는 자동 추종 없이 오류. JSON media type은 JSON 파싱, 나머지 지원 text 응답은 문자열. HEAD·204·205의 body는 null. 잘못된 JSON·지원하지 않는 바이너리는 응답 오류 |
| Login | 호출별로 독립 실행하고 진행 중 Login도 공유하지 않음. 완료 토큰 캐시 없음. 실패·잘못된 토큰·취소 시 실제 API 요청을 시작하지 않음 |
| 시간 제한 | 요청 실행 계획의 Login+실제 HTTP 전체에 기본 30,000ms. 호스트 설정 requestTimeoutMs로 양의 안전 정수 범위에서 변경. 만료 시 TIMEOUT·협력 취소·늦은 결과 폐기. Action 전체나 Datasource의 고정 필드로 확대하지 않음 |

**method·baseUrl·path 평가와 목적지 검사(U27–U28):** 실제 요청과 Login 요청의 method·baseUrl·path를 해당 요청의 값 문맥에서 먼저 평가한다. baseUrl은 요청에 지정한 값을 선택하고, 생략했을 때만 Datasource.baseUrl을 사용한다. 선택하지 않은 fallback은 평가하지 않으며 명시 null·잘못된 타입·누락된 참조를 fallback으로 숨기지 않는다. Login도 baseUrl만 이 생략 fallback을 사용하며 외부 headers·params·auth는 상속하지 않는다. 결과 method는 위 7종 문자열, baseUrl·path는 문자열이어야 한다. 기존 URL 문법·공통 경로 보존·목적지 권한 검사는 평가 후 그대로 적용한다.

평가 후 취소/timeout을 다시 확인하고, 결합된 목적지에 신뢰 caller의 권한 검사를 수행한 뒤에만 headers·params·body 평가용 secret resolver 권한을 제공한다. 목적지가 확정되지 않은 method·주소 평가에는 resolver를 제공하지 않으며 빈 목적지로 조회하지 않는다. params를 붙인 최종 URL도 전송 직전에 재검사한다. 평가된 method를 실제 전송·GET/HEAD 본문 거절·HEAD 응답 처리에 일관되게 사용한다.

**Login request 전체 참조(U28):** auth.request 전체도 동적 값이다. 전체 @path의 결과는 요청 객체로 검사하고 각 필드의 전송 타입·헤더·주소·권한 검사를 적용한다. 반환된 객체 안의 @path/@call·@@ 키를 다시 실행하거나 해제하지 않는다. 반면 원래 선언한 요청 객체의 동적 필드는 재귀 평가한다. 일반 데이터 request 컨테이너 전체를 동적 영역으로 새로 확대하는 규칙은 아니다.

**실행 전 문법 검사(U28):** 원래 선언의 동적 영역에 있는 혼합 표현식·잘못된 Pointer·미지원 함수/인자 형식·정적 formatString 보간 문법은 Login·secret 조회 전에 거절한다. 동적 참조 결과의 타입·내용은 해당 단계에서 검사한다. 참조 결과에 표현식처럼 보이는 데이터가 있어도 문법 트리로 다시 해석하지 않는다. 현재 실험의 17개 적용 위치·검증과 미구현 범위는 [전체 경로 점검 기록](../handoff/t2-path-audit-2026-10-30.md)을 따른다.

**params 객체 검사(U25):** Datasource·실제 요청·Login 요청의 params를 각각 평가한 직후, 병합 전에 일반 객체인지 검사한다. 선언 생략은 허용하지만 명시 null·배열·문자열·숫자·boolean·native Map/Set/Date는 params 객체로 취급하지 않고 INVALID_DEFINITION으로 거절한다. 실험의 일반 객체 판정은 Object.prototype 또는 null prototype이며 배열 인덱스나 문자열 문자를 키로 자동 변환하지 않는다. 뒤의 정상 선언·키 제거가 앞의 잘못된 컨테이너를 감추지 못한다. 요청 우선 병합·값 null의 키 제거·배열 값의 순서 있는 반복 인코딩은 유지한다. 이는 params 컨테이너 검사이며 전체 리소스 등록 검증·표현식 구현 완료를 뜻하지 않는다.

params/form의 스칼라 문자화는 이 전송 경계에 명시된 인코딩이며 core 저장값의 암묵 타입 변환을 허용하는 것이 아니다. 숫자·-0·중첩 값 검증은 인코딩보다 먼저 수행한다. 헤더 키 비교의 기준은 [HTTP field names](https://www.rfc-editor.org/rfc/rfc9110.html#name-field-names)이며 위 지원 범위·기본값·null 처리 자체는 프로젝트 선택이다.

**전송 계층 관리 헤더 거절(U20):** U19에서 [Chromium의 명시 Host 무시](../handoff/t2-http-boundary-2026-10-29.md)를 확인했고, 사용자가 명시 거절 권고를 수락했다. v1 직접 실행·서버 실행·Login에 같은 규칙을 적용한다.

- 이름은 ASCII 대소문자를 무시한다. `Accept-Charset`, `Accept-Encoding`, `Access-Control-Request-Headers`, `Access-Control-Request-Method`, `Connection`, `Content-Length`, `Cookie`, `Cookie2`, `Date`, `DNT`, `Expect`, `Host`, `Keep-Alive`, `Origin`, `Referer`, `Set-Cookie`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`, `Via` 및 `Proxy-`·`Sec-` 접두사의 이름은 리소스 headers에 선언할 수 없다. 기준은 [Fetch 금지 요청 헤더](https://fetch.spec.whatwg.org/#forbidden-request-header)이며, 런타임마다 목록을 달리하거나 표준 변경을 자동으로 계약에 반영하지 않는다.
- v1은 추가로 `User-Agent`, `X-HTTP-Method`, `X-HTTP-Method-Override`, `X-Method-Override`를 값에 관계없이 거절한다. 전자는 클라이언트 식별을 전송 계층에 맡기고, 후자는 선언한 method 밖의 우회 의미를 기본 프로필에 넣지 않기 위한 프로젝트 선택이다. Fetch가 이 네 이름을 전부 무조건 금지한다는 뜻은 아니다.
- 금지 이름은 값이 null이어도 오류다. Datasource·요청·Login의 각 선언을 **병합 전에** 검사하므로 뒤의 덮어쓰기나 제거로 감출 수 없다. 정적인 이름 검사는 secret 해석·Login을 포함한 네트워크 실행 전에 끝낸다. 동적 헤더 값은 해당 요청 실행 전에 평가·검증한다. 위반은 값·토큰을 포함하지 않는 `INVALID_DEFINITION`이며, 조용한 삭제·자동 서버 우회는 없다.
- 허용 이름은 HTTP token 문법, 값은 HTAB 또는 0x20–0x7E/0x80–0xFF 범위의 문자열이다. 값의 앞뒤 SP/HTAB만 제거하고 내부 문자는 보존한다. 그 밖의 제어 문자·CR/LF·직접 Unicode 값은 거절한다. Unicode 데이터를 헤더에 넣으려면 해당 서비스의 인코딩을 명시해야 한다. `Authorization`, `X-API-Key`, `Content-Type` 등의 일반 헤더와 요청 우선 병합·null 제거는 유지한다.

**headers 객체 전체의 @path(U26):** `headers: {"@path":"/ports/requestHeaders"}`는 헤더 이름 선언이 아니라 객체 참조 표현식이다. 사전 검사는 정확한 @path 표현식과 정적 헤더 객체를 구분하고, 정적 이름의 금지/중복 검사는 기존처럼 secret 해석·Login 전에 수행한다. 전체 참조는 해당 요청 문맥에서 한 번 평가한 뒤 일반 객체 여부와 이름·값·금지 이름·대소문자 중복을 **각 선언별 병합 전에** 검사한다. 참조 결과 안의 데이터는 표현식으로 다시 실행하지 않는다. null 제거 표시는 병합까지 보존하고, 뒤의 덮어쓰기로 금지 헤더를 감출 수 없다. 동적 결과가 금지되면 해당 요청을 전송하지 않는다. 최종 데이터 요청의 동적 헤더를 확인하기 전에 필요한 Login은 이미 수행됐을 수 있으며, 정적 금지 이름의 Login 전 거절과 구별한다.

이 규칙은 **명시한 리소스 헤더**의 지원 범위다. Host 등 실제 전송에 필요한 헤더는 전송 계층이 생성하며, 목적지는 baseUrl/path와 기존 서버 정책으로 결정한다. 자동 생성 헤더의 바이트 단위 동일성, CORS 허용, 모든 브라우저 지원을 보장하지 않는다. 실행 증거와 남은 범위는 [HTTP 실험 기록](../handoff/t2-http-boundary-2026-10-29.md)에 둔다.

서버 전달은 `HttpExecutionPlan`으로 고정한다: `version:1`, 호출별 `requestId`, 현재 `datasource` Http spec, 현재 source의 `request` 템플릿, 확정된 Value 입력 snapshot인 `inputs`. 저장 원본 ID 재조회나 View 전체 전송은 요구하지 않는다. inputs의 Set/Map은 기존 E47 콜백 변환을 거치고, 선언된 날짜 값은 [U14의 정규 문자열](10-value-contracts.md#날짜-값과-전송-형식)로 전달한다. 일반 문자열의 날짜 추정이나 timestamp 변환은 하지 않는다. 리소스 위치는 진단용 선택 필드이며 권한 증명이 아니다.

실행기 인터페이스는 `executeRequest(plan, {signal}) -> Promise<{status, headers, body}>`다. 직접 실행과 서버 실행 모두 같은 계획을 해석하되 비밀값이 필요한 계획은 서버 경로로 보낸다. 서버는 요청 템플릿의 /ports를 전달 inputs에만 바인딩한다. 승인된 요청 구성 단계에 /secrets, Login 후 데이터 요청에 /auth/token을 제공하며, auth.token 추출에는 해당 Login의 /response만 제공한다. 승인된 표현식/함수만 평가하고 최종 목적지·비밀 참조·호출자 권한을 재검증한다. 실행기 내부의 실제 secret·Login 응답·추출 토큰을 계획 inputs나 클라이언트 결과에 덧붙이지 않는다. 최종 API 응답 자체의 내용은 위 U21 책임 구분을 따른다. 요청 우선 병합은 최종 전송 전에 적용한다.

서버의 secret resolver는 `resolveSecret(reference, {caller, destination, signal})`로 정의하고 서비스가 구현한다. caller·허용 destination 정책은 서버가 신뢰할 수 있는 실행 문맥에서 제공하며 클라이언트 DTO 값을 그대로 권한으로 채택하지 않는다. 클라이언트에 돌아오는 오류는 [공통 오류 계약](07-host-integration.md#공통-오류와-진단)으로 정제한다. 실제 전송 어댑터의 timeout·취소·권한 검증은 구현 검증 과제로 남으며 이번 문서 작성이 실행 검증을 대신하지 않는다.

**U20 판정 정정(U21):** [독립 HTTP 실험](../handoff/t2-http-boundary-2026-10-29.md)의 P21은 API가 의도적으로 반환한 합성 키를 전달한 사례였다. 이를 Viewstem 결함으로 분류하고 응답 전체의 secret 문자열 차단을 권고한 판정을 철회한다. 원래 관찰·이력은 보존하고, 현재 테스트는 API 응답 전달과 실행기 내부 정보의 비노출을 별개 기대값으로 검증한다.


**U21 문제의 수정·검증(U22):** [HTTP 실험의 P30–P33](../handoff/t2-http-boundary-2026-10-29.md)에서 auth.token의 secret 접근을 차단하고, 중첩 표현·잘못된 경로 거절과 정상 Login 응답 추출을 확인했다. 호출별 요청 평가에만 secret 해석 권한을 주므로 토큰 추출에서 빈 목적지의 resolver 호출이 사라졌다. 이후 발견한 오류 정제의 추가 예외도 U23에서 보완·검증했다. [현재 실험 기록](../handoff/t2-http-boundary-2026-10-29.md)의 Node/Chromium 전송 대조와 [U24 배열 경로 수정](10-value-contracts.md#동적-값-평가-프로필)을 구별한다. U24의 P46 params 컨테이너 문제는 U25에서 각 평가 결과를 병합 전에 검사하도록 수정했고, 기존 반복 키 인코딩도 유지·검증했다. U25의 P51은 U26에서 전체 @path를 구분하고 참조 결과에도 금지 헤더 검사를 적용하도록 수정·검증했다. U26의 P61은 U27에서 경로 평가 후 기존 주소·목적지 검사를 연결하도록 수정·검증했다. 이후 P71에서 발견한 Datasource.baseUrl 평가 누락은 U28에서 수정했다. [U28 전체 점검](../handoff/t2-path-audit-2026-10-30.md)은 method·Login request 전체·공통 경로 문법까지 보완해 현재 HTTP/Login의 동적 값 17개 위치를 검증했다. 실제 core·State/Action/renderer 연결은 아직 구현하지 않았다.
