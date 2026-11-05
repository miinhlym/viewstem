---
title: Type과 스키마
description: Type 리소스, 지원하는 스키마 키워드, 네이티브 값의 계약을 설명합니다.
sidebar:
  order: 8
---

## Type 리소스

Type 리소스에는 `kind: "Type"`과 필수 `schema` 필드 하나가 있는 본문을 둡니다. 리소스 ID 문자열을 `typeRef`에 넣으면 Type을 재사용할 수 있습니다. `TypeContract`는 `schema`와 `typeRef` 중 하나를 받습니다. Value 및 State 포트, State 및 Derived 선언, 이벤트 payload, Action 출력에 적용합니다.

이 Type은 이름이 필수이고 기한 날짜가 선택적인 객체를 받습니다. `{ "typeRef": "project" }`를 쓰는 계약에는 `{ "name": "Plan", "due": "2026-11-05" }`를 전달할 수 있습니다.

```json title="project-type.json"
{
  "kind": "Type",
  "id": "project",
  "spec": {
    "schema": {
      "$defs": { "dueDate": { "x-viewstem-type": "date" } },
      "type": "object",
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "due": { "$ref": "#/$defs/dueDate" }
      },
      "required": ["name"],
      "additionalProperties": false
    }
  }
}
```

## 스키마 키워드

`Schema`는 불리언 또는 객체입니다. Core는 아래 JSON Schema 2020-12 부분집합을 사용합니다. `$schema`를 명시할 때 허용하는 URI는 `https://json-schema.org/draft/2020-12/schema`입니다.

| 범위 | 지원 키워드 |
| --- | --- |
| 기본 및 조합 | `type`, `enum`, `const`, `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else` |
| 숫자 | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` |
| 문자열 | `minLength`, `maxLength`, `pattern` |
| 객체 | `properties`, `required`, `additionalProperties`, `minProperties`, `maxProperties` |
| 배열 | `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems` |
| 로컬 재사용 | `$defs`와 같은 스키마 안에서 `#/`로 시작하는 비순환 `$ref` 포인터 |
| 설명용 항목 | `title`, `description`, `default`, `examples`, `readOnly`, `writeOnly`, `deprecated`, `$comment` |
| 네이티브 확장 | `x-viewstem-type`과 Map의 `keys`, `values` 필드 |

등록할 때 `format`, `multipleOf`, `contains`처럼 지원하지 않는 키워드와 외부 또는 순환 참조를 거절합니다. 검증은 타입을 자동 변환하거나 속성을 제거하지 않습니다. 스키마의 설명용 항목은 메타데이터를 제공합니다. State 초기값은 `initial`에, 생략한 Value 입력의 기본값은 포트의 `default`에 둡니다. 스키마의 `required`는 객체 속성을 나열하고 포트의 `required`는 입력의 필수 여부를 정합니다.

## 네이티브 값

`x-viewstem-type`을 쓸 때 같은 스키마 객체에 `type`을 함께 둘 수 없습니다. null을 허용하려면 `anyOf`에서 `{ "type": "null" }`과 조합합니다.

| 타입 | 허용 값과 스키마 필드 |
| --- | --- |
| `set` | 네이티브 JS Set. `items`가 필수이며 `minItems`와 `maxItems`를 둘 수 있습니다. |
| `map` | 키가 문자열 또는 유한 숫자인 네이티브 JS Map. `keys`와 `values`가 필수이며 `minItems`와 `maxItems`를 둘 수 있습니다. |
| `date` | 시간대 없이 검증하는 달력 날짜 문자열 `YYYY-MM-DD`. |
| `time` | 지역 시각 문자열 `HH:mm`. 초와 그 뒤의 소수 1~3자리를 추가할 수 있으며 `HH:mm:ss.SSS`로 정규화합니다. |
| `datetime` | `YYYY-MM-DDTHH:mm:ss`에 선택적 소수 1~3자리와 필수 `Z` 또는 `±HH:mm`를 붙인 시점 문자열. 밀리초 정밀도의 UTC 값으로 정규화합니다. |

날짜는 그레고리력 0001~9999년을 사용합니다. datetime은 알 수 없는 오프셋 `-00:00`을 거절하며, 날짜와 시각에는 실제 달력과 시계 범위가 적용됩니다. 예를 들어 `2026-11-05T09:30:00+09:00`은 `2026-11-05T00:30:00.000Z`가 됩니다. 같은 값 위치에서 문자열을 허용하는 스키마 분기는 날짜 정규화 방식이 같아야 합니다. 날짜 상수와 열거 값은 정규 형식으로 작성하세요. 정규화 결과 서로 다른 키가 하나로 합쳐지는 Map은 거절합니다.

네이티브 Set과 Map은 호스트 입력이나 타입 검증을 거치는 계산으로 전달할 수 있습니다. JSON 배열은 배열로 유지됩니다. HTTP 계획은 Set을 배열로, Map을 키와 값 쌍의 배열로 인코딩합니다. State와 포트는 유한 숫자를 받으며 `integer`에는 JS 안전 정수 범위를 적용합니다. Core는 음수 0을 0으로 정규화하고 값이 undefined인 객체 속성을 생략합니다. 최상위 undefined, 빈 슬롯이 있는 배열, undefined 컬렉션 원소, 순환 구조, 지원하지 않는 객체는 값 경계에서 거절합니다.

JS 선언은 [Core 타입](/ko/docs/core/types/), 여러 포트에서 Type을 공유하는 예는 [리소스와 타입](/ko/docs/concepts/resources-and-types/)을 참고하세요.
