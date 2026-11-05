---
title: 값과 입력
description: 포트로 입력을 받고 @path와 @call로 동적 값을 연결합니다.
---

Component의 입력에는 고정된 값이나 현재 실행 문맥에서 값을 읽는 표현식을 넣습니다. **ports**는 정의가 받을 입력의 계약이고, **inputs**는 그 정의를 사용하는 쪽에서 전달하는 값입니다.

## 입력 계약 선언하기

이 View는 필수 문자열 입력 `title`을 받아 배지에 표시합니다.


```json
{
  "ports": {
    "title": {
      "kind": "Value",
      "schema": {
        "type": "string"
      },
      "required": true
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/ports/title"
      }
    }
  }
}
```


마운트할 때 `view`와 함께 `inputs: { title: "Projects" }`를 전달하면 배지에 **Projects**가 표시됩니다. `schema`는 값의 타입을 검사하고 `required`는 필수 입력임을 나타냅니다. 선택적 Value 포트에는 입력 생략 시 사용할 `default`를 둘 수 있습니다.

## @path로 값 읽기

`{ "@path": "/ports/title" }`은 `title` 포트의 값을 읽습니다. 읽은 값의 타입은 유지되므로 boolean은 boolean, 배열은 배열로 전달됩니다. `"/ports/title"`처럼 일반 문자열로 쓰면 경로를 읽지 않고 문자 그대로 전달합니다.

| 경로 | 읽는 문맥 |
|---|---|
| `/ports/title` | 현재 정의가 선언한 입력 |
| `/states/title` | 현재 View 또는 Component의 State나 Derived |
| `/queries/projects/data` | 로컬 Query의 결과 |
| `/event/value` | 이벤트 연결에서 입력을 평가할 때의 이벤트 payload |

경로는 실행 범위 안에서 해석합니다. 앱의 모든 값에 접근하는 전역 주소가 아닙니다. 중첩 정의도 필요한 값을 포트로 전달받습니다. 아직 준비되지 않은 값은 자동으로 `null`이 되지 않습니다.

## @call로 입력값 만들기

배지의 `inputs.text`를 아래 표현식으로 바꾸면 **Open Projects**가 표시됩니다.


```json
{
  "@call": "concat",
  "args": [
    "Open ",
    {
      "@path": "/ports/title"
    }
  ]
}
```


`@call`은 사용할 수 있는 값 함수를 호출합니다. Action을 실행하거나 네트워크 요청을 보내는 표현식은 아닙니다. 재사용할 CEL 계산이 필요하면 Variable로 정의합니다.

## 값과 연결 구분하기

| 포트 kind | 전달받는 것 |
|---|---|
| `Value` | 읽을 값. 전달받는 것만으로 쓰기 권한이 생기지 않습니다. |
| `State` | 기존의 쓰기 가능한 State. 연결된 State를 명시적으로 변경할 수 있습니다. |
| `Query` | 기존 Query 인스턴스. 상태를 관찰하고 새로고침할 수 있습니다. |

받는 포트의 종류에 따라 경로가 값을 전달할지, 인스턴스를 연결할지가 결정됩니다. State 포트에는 현재 값과 같은 리터럴이 아니라 기존 State를 가리키는 경로를 전달합니다.

[View 입력 예제](../../../examples/view-inputs/)에서 전달하는 값을 바꿔 보세요.

사용 가능한 값 표현식과 함수 호출 형태는 [값 표현식 레퍼런스](../../dsl/values/)에서 확인하세요.
