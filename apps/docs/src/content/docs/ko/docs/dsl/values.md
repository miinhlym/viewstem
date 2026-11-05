---
title: 값 표현식
description: 리터럴과 @path, @call 문법 및 위치별 참조 범위를 설명합니다.
sidebar:
  order: 2
---

## ValueExpression과 PathExpression

`ValueExpression`은 평가를 지원하는 필드에 놓인 JSON 값입니다. 평가기는 배열과 일반 객체를 재귀적으로 방문합니다. 문자열, 숫자, 불리언, null은 리터럴입니다. 경로와 함수 호출은 아래 객체 형식을 따릅니다.

| 형식 | 결과 |
| --- | --- |
| `{"@path":"/ports/title"}` | 원래 타입을 유지한 참조 값. 객체에는 `@path` 키 하나만 둡니다. |
| `{"@call":"concat","args":["A","B"]}` | 사용 가능한 함수의 결과. 객체에는 `@call`과 `args`만 둡니다. |
| `{"@@path":"/ports/title"}` | 실제 키가 `@path`이고 값은 문자열인 데이터 객체. |
| `{"path":"/ports/title"}` | 일반 데이터 객체. `path` 키에는 표현식 의미가 없습니다. |

동적 필드에서 실제 데이터 키가 `@`로 시작하면 앞에 `@`를 한 번 더 붙입니다. 평가기는 맨 앞의 `@` 하나를 제거하고, 반환된 데이터를 다시 평가하지 않습니다. `@literal`처럼 인식하지 못하는 단일 `@` 키나 다른 키를 섞은 표현식은 `INVALID_EXPRESSION` 오류를 냅니다. 스키마 객체, 포트 기본값, reaction의 값, 참조 ID, CEL 소스 문자열은 작성한 그대로 사용합니다.

`InputExpressions`는 입력 이름을 표현식에 연결하는 객체입니다. 직접 경로가 값을 읽을지, State 또는 Query 핸들을 연결할지는 받는 쪽 [포트](/ko/docs/dsl/state-and-ports/#포트)가 결정합니다. 호스트 JS에서 받는 입력은 이미 평가된 값 또는 핸들입니다.

## 경로로 읽기

경로는 `/`로 시작합니다. JSON Pointer 규칙에 따라 `~`에는 `~0`을, `/`에는 `~1`을 씁니다. 객체 자체의 데이터 속성과 실제 존재하는 배열 원소만 읽습니다. 배열 인덱스는 10진수이며 `0` 외에는 앞에 0을 붙일 수 없습니다. 배열 길이, 상속 속성, 네이티브 Set과 Map의 원소는 이 경로 문법으로 읽을 수 없습니다.

| 평가 위치 | 루트 |
| --- | --- |
| 노드 inputs, `when`, `repeat.items`, `repeat.key` | `/ports`, `/states`, `/queries`, `/actions`, 현재 범위의 `/repeat` 별칭 |
| 노드 `on`의 inputs와 `emit.payload` | 위의 작성자 루트와 payload를 제공하는 `/event` |
| State `initial`과 Derived `inputs` | `/ports`, `/states` |
| Query 사용의 입력과 실행 조건 | `/ports`, `/states`, `/queries` |
| 중첩 Query 소스 입력 | 상위 Query의 `/ports` |
| Query 변환 | `/ports`, `/sources` |
| Action 단계의 입력, 조건, 값, 메시지와 Action 출력 | `/ports`, 현재 범위에서 완료된 결과의 `/steps` |
| HTTP 템플릿 | 위치별 `/ports`, `/secrets`, `/auth/token` 또는 `/response`. [HTTP 표현식 문맥](/ko/docs/dsl/datasources/#표현식-문맥) 참고. |

슬롯 전달에는 `{"@path":"/slots/content"}` 같은 구조 전용 경로를 사용합니다. Variable의 CEL 식은 포트에 선언한 이름을 직접 사용합니다. [VariableSpec](/ko/docs/dsl/state-and-ports/#variablespec)을 참고하세요.

## 값 함수 호출

| 함수 | 인수와 결과 |
| --- | --- |
| `concat` | 문자열 표현식 배열. 순서대로 이어 붙이며 빈 배열은 빈 문자열을 반환합니다. |
| `formatString` | 문자열로 평가되는 `value` 필드 하나를 가진 객체. `${/절대/경로}`에 문자열, 유한 숫자, 불리언, null을 보간합니다. `$$`는 달러 기호 하나를 만듭니다. |
| 등록한 순수 함수 | 함수의 입력 스키마로 검증하는 인수 배열. 동기 반환값은 출력 스키마로 검증합니다. [CEL 함수](/ko/docs/core/cel/)를 참고하세요. |

`title`이 `"A"`이고 `cost`가 `12`이면 아래 결과는 `Project A costs $12`입니다.

```json title="format-title.json"
{
  "@call": "formatString",
  "args": { "value": "Project ${/ports/title} costs $$${/ports/cost}" }
}
```

## 값의 누락, 대기, 오류

선언되지 않은 이름이나 유효하지 않은 배열 인덱스는 참조 오류입니다. 없는 데이터 속성을 읽으면 `INPUT_NOT_READY`가, 스칼라나 null 아래를 탐색하면 `TYPE_MISMATCH`가 발생할 수 있습니다. 자동 평가에서는 준비 중인 의존 값의 대기 상태를 유지합니다. 준비된 null, false, 0은 각각 실제 값입니다. 함수 호출과 문자열 보간은 의존 값의 실패나 대기를 전달합니다. [값과 입력](/ko/docs/concepts/values-and-inputs/)과 [Core 타입](/ko/docs/core/types/)을 참고하세요.
