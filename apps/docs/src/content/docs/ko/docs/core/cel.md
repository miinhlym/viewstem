---
title: "CEL 평가"
description: "선택 CEL 진입점으로 순수한 동기 CEL 표현식을 컴파일하거나 평가합니다."
sidebar:
  order: 16
---

선택 CEL 진입점으로 순수한 동기 CEL 표현식을 컴파일하거나 평가합니다.

```ts
import { compileCel, evaluateCel, defaultCelLimits } from '@viewstem/core/cel';
import type { CelOptions, CelLimits, CelFunction, CelValue } from '@viewstem/core/cel';
```

## 함수

- `compileCel(expression: string, options?: CelOptions): (bindings?: Record<string, unknown>) => unknown`: 스키마를 검증하고 한 번 컴파일합니다. 반환된 함수를 새로운 binding으로 반복 호출할 수 있습니다.
- `evaluateCel(expression: string, bindings: Record<string, unknown>, options?: CelOptions): unknown`: 한 번에 컴파일·평가합니다.
- `defaultCelLimits: CelLimits`: 아래 기본 제한을 가진 동결된 객체입니다.

```js title="cel-evaluation.mjs"
import { compileCel, evaluateCel } from '@viewstem/core/cel';
const options = { inputs: { count: { type: 'integer' } }, output: { type: 'integer' } };
const increment = compileCel('count + 1', options);
console.log(increment({ count: 2 })); // 3
console.log(evaluateCel('count + 1', { count: 4 }, options)); // 5
```

## CelOptions

| 필드 | 기본값 | 계약 |
|---|---|---|
| `inputs` | `{}` | binding 이름 → 지원하는 `Schema`입니다. 평가 시 정확히 이 이름들을 제공해야 합니다. |
| `output` | `true` | 반환값을 검증하는 스키마입니다. |
| `functions` | `[]` | 신뢰하는 `CelFunction` 정의의 읽기 전용 목록입니다. |
| `limits` | 아래 표 | `CelLimits` 일부를 양의 안전 정수로 덮어씁니다. |
| `cost` | 100000 | 양의 안전 정수로 지정하는 평가 비용 한도입니다. |

컴파일러는 AST 노드 10000개 제한도 적용합니다. 컴파일·평가 오류는 동기적으로 던집니다. 잘못된 한도는 `INVALID_LIMIT`, 값 그래프·문자열 한도 초과는 `LIMIT_EXCEEDED`입니다. CEL 자체의 표현식·타입 진단도 발생할 수 있으며 View를 통해 실행하면 런타임이 공개 진단으로 변환합니다.

## CelLimits

| 필드 | 기본값 | 의미 |
|---|---:|---|
| `expressionChars` | 65536 | 최대 표현식 문자열 길이 |
| `inputNodes` | 20000 | 순회한 입력 그래프 노드 수 |
| `outputNodes` | 20000 | 순회한 출력 그래프 노드 수 |
| `valueBytes` | 262144 | 값·키 문자열의 UTF-8 바이트 수 |
| `depth` | 64 | 값·표현식의 최대 중첩 깊이 |

## CelFunction과 CelValue

함수는 `{ name, inputs: Schema[], output: Schema, run }`입니다. 이름은 `[A-Za-z_][A-Za-z0-9_]*` 형식이며 기본 함수·다른 등록 함수와 충돌하면 안 됩니다. `run(...args)`는 동기·순수 함수로서 깊은 읽기 전용의 스키마 검증된 인자를 받고 스키마로 검증할 `CelValue`를 반환합니다. 제네릭 인자 튜플을 명시하면 TypeScript가 각 인자의 타입을 확인할 수 있습니다. Promise는 금지합니다. 한도가 임의의 호스트 콜백을 sandbox로 격리하거나 JavaScript 실행 시간을 제한하지는 않습니다.

`CelValue`는 null·boolean·유한 숫자·문자열·읽기 전용 배열/객체·읽기 전용 Set·문자열/숫자 키의 읽기 전용 Map을 포함합니다. 실제 허용 형태는 Core 스키마 프로필을 따릅니다. 일반 `number`는 CEL double이며 `integer`는 JavaScript 경계에서 안전 정수여야 합니다. 명시적인 날짜·시간 스키마는 선언한 문자열과 시간대 규칙을 사용합니다.

## 지원 언어 범위

패키지의 `@viewstem/core/cel-support.json`에 정확한 지원 시그니처를 제공합니다. CEL 전체를 지원한다고 주장하지 않으며 bytes, uint, type, optional, cel.bind는 미지원입니다. 리소스는 Variable 정의로 CEL을 실행합니다. 검증을 우회하기 위해 내부 표현식 엔진을 가져오지 마세요. [DSL 값](../../dsl/values/), [타입](../../dsl/types/)을 함께 참고하세요.
