# Variable · Type · 타입 경계

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**예시 해석:** 아래 발전소·날씨·협력사 등의 명칭은 이전 논의의 설명용 예시다. `example.com` 계열 주소와 임의 ID만 사용하며 실제 회사 API·비밀값·기본 등록 리소스가 아니다. core는 이 도메인에 의존하지 않는다.

값 연결용 `@path/@call`과 Variable 내부의 CEL은 별도 역할이다. Variable은 `spec.expression`에서 CEL을 사용한다. JS/TS 실행기·함수·값 변환의 지원 범위는 [Core CEL](../core-cel.md)을 따른다.

2026-10-29 복원한 [값 표현·시간·비교·읽기 보호·날짜 상세](10-value-contracts.md)는 이 문서의 계약에 포함된다. 이미 승인한 의미와 CEL/JSON/JS/Dart에 연결할 구현 상세를 구별한다.

## 10.3 Variable: 재사용 순수 계산

**확정 범위:** Variable은 `spec.ports`의 Value 입력만 받아 `spec.expression`의 CEL로 계산하는 순수 정의다. 사용하는 곳에서 `variableRef`와 `inputs`를 연결한다. CEL 안에서는 port 이름을 직접 쓴다. StateStore를 암묵적으로 읽거나 쓰지 않는다. 계산 실패를 기본값/빈값으로 숨기지 않고 의존 계산에 전파하며 무관한 UI는 유지한다. 오류 코드·전체 타입 검증 스키마 및 실행기 적합성은 남아 있다. [E21, E34]

```json
{
  "kind": "Variable",
  "id": "count-selected-plants",
  "name": "선택 발전소 개수",
  "spec": {
    "ports": {
      "plants": {
        "kind": "Value",
        "schema": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "expression": "size(plants)"
  }
}
```

`plants`는 아래 Component가 전달하는 문자열 배열이다. 이 Variable 정의 자체가 선택 상태를 소유하는 것은 아니다. Derived가 계산 결과를 읽기 전용 상태로 제공한다.

### 배열 크기 계산

**확정·검증(U24):** 배열 크기는 Variable의 CEL에서 `size(items)` 또는 `items.size()`로 계산한다. 여기서 items는 Value 포트 이름이며 `/ports/items/length`로 JS 속성을 읽는 방식으로 대체하지 않는다. 목록 개수 표시에는 `size(items)`, 빈 목록 판정에는 `size(items) == 0`, 선택 수 제한에는 `size(items) <= 2`처럼 사용한다. 이는 [CEL의 표준 목록 연산](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#list-operators)이며 새 커스텀 함수가 필요하지 않다.

고정된 `@marcbachmann/cel-js@8.0.0`에서 두 호출 문법·빈 배열·중복/null 원소·중첩/객체 배열·필터 결과·조건식을 [독립 실행](../../experiments/t1-values/array-size-tests.mjs)했다. Node 22.21.1·24.19.0 각각 18/18 통과했고, count의 CEL int 결과(BigInt)를 기존 안전 정수 어댑터로 JS number에 변환했다. 10,000개 입력은 기능 사례이며 성능·비용 상한 증거가 아니다. [실험 기록](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/t2-http-boundary-2026-10-29.md)을 따르며 실제 Variable/Derived 연결·Dart·브라우저 CEL·native Set/Map 지원까지 이 검사로 입증하지 않는다.

### 시간 의존 계산과 다른 Variable 재사용

**보존할 확정 의미:** 현재 시각을 계산 입력으로 공급하고, 그 시간이 바뀌면 의존 계산을 다시 평가하는 기능은 CEL 도입 뒤에도 유지한다. 시간도 명시적인 Value 입력 연결로 전달하며 CEL이 주변 Store나 숨은 전역 clock을 읽는 두 번째 계산 모델을 만들지 않는다. 공급 API는 U13의 Clock 계약을 따르고 주기는 명시 공급자가 소유한다. 시간대·달력 경계는 [U14의 명시 업무 시간대](10-value-contracts.md#명시-업무-시간대와-달력-연산)를 따른다. 이 결정으로 서비스가 관리하는 선택 날짜/시간이나 LIVE 상태를 core가 자동 변경한다고 해석하지 않는다. [E53]

예를 들어 Derived `count`가 계산한 값을 다른 Variable 사용의 `inputs: { total: { "@path": "/states/count" } }`로 전달한다. 두 번째 Variable은 `total` Value 포트를 선언한다. CEL 식 안의 중첩 연산이 리소스 ID 참조를 자동 해결하는 것은 아니다. 정의 참조와 입력 연결은 Viewstem이, 전달된 값의 계산은 CEL이 담당한다. 자세한 [시간 입력과 재평가 경계](10-value-contracts.md#시간-입력과-재평가)를 따른다. [E53]

## 10.7 Type: 선택적 공통 데이터 형태

**확정:** Type은 JSON Schema 데이터 형태를 선택적으로 재사용하는 독립 리소스이며 본문은 spec.schema다. 데이터 타입을 선언하는 Value/State 포트·State·출력·이벤트 계약에서는 inline schema와 typeRef 중 정확히 하나를 선택한다. 데이터와 State를 공유하는 기능은 아니다. JSON Schema의 v1 프로필은 아래 U13을 따른다. [E41, U13]

```json
{
  "kind": "Type",
  "id": "plant-summary",
  "name": "발전소 요약",
  "spec": {
    "schema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "name": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "name"
      ]
    }
  }
}
```

포트의 required:boolean은 입력 존재 여부, schema 안의 required:string[]은 객체의 필수 속성을 뜻한다. schema/typeRef와 포트 kind를 분리하여 충돌을 없앤다. typeRef는 독립 Type ID이고 JSON Schema 내부 $ref와 혼합하지 않는다. schema.default는 초기화 명령이 아니며 readOnly는 실행 권한이 아니다. native Set/Map·날짜와 JSON/CEL/JS/Dart 간 변환은 기존 요구를 보존하며 적합성으로 검증한다. 단, [Query 서비스 콜백 직전 Set/Map 재귀 변환의 형태와 책임](01-datasource-auth.md#query-서비스-콜백의-컬렉션-변환)은 이미 확정된 경계이며 다시 미결로 돌리지 않는다. [E47]

State의 missing 읽기·undefined 처리·숫자 범위·표현·정규화, 미지원 값·순환 데이터 거절과 검증 순서, 타입별 변경 동등성, 격리된 읽기 참조와 snapshot, 정수 날짜 add·YY 경계·합의된 datetime 포맷 의미는 [값 계약 상세](10-value-contracts.md)에 명시한다. 이 의미를 직렬화 프로필이나 실행기 선택과 함께 통째로 미결로 돌리지 않는다. JSON Schema의 데이터 형태 선언만으로 이 런타임 의미가 자동 구현되는 것도 아니다. 스키마 검증 중 타입 강제 변환·default 자동 주입·불허 속성 제거를 하지 않는 U12의 공통 규칙도 적용한다. [E58–E60, U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12]

## v1 스키마 프로필

**확정(U13):** JSON 데이터 부분은 JSON Schema 2020-12를 기준으로 한다. 이는 전체 표준 키워드나 모든 검증 라이브러리 옵션의 지원 약속이 아니다. `$schema`를 생략하면 이 프로필이며, 명시할 때는 `https://json-schema.org/draft/2020-12/schema`만 허용한다. 알 수 없거나 지원하지 않는 키워드는 등록 오류로 드러내며 조용히 무시하지 않는다.

| 범위 | v1 지원 |
|---|---|
| 공통 | boolean schema, type, enum, const, allOf, anyOf, oneOf, not, if/then/else |
| 숫자 | minimum, maximum, exclusiveMinimum, exclusiveMaximum. integer 안전 범위·number 유한성은 추가 core 계약 |
| 문자열 | minLength, maxLength, pattern |
| 객체 | properties, required, additionalProperties, minProperties, maxProperties |
| 배열 | items, prefixItems, minItems, maxItems, uniqueItems |
| 로컬 재사용 | $defs와 같은 문서 안의 #/ JSON Pointer $ref. 외부 네트워크 참조·순환 $ref·dynamicRef는 v1에서 거절 |
| annotation | title, description, default, examples, readOnly, writeOnly, deprecated, $comment. 값을 변경하거나 권한을 부여하지 않음 |

`multipleOf`, unevaluatedProperties/Items, contains 계열, dependent 계열 등 표 밖의 키워드는 현재 프로필에 포함하지 않는다. **U14:** 표준 `format` 키워드도 v1에서는 등록 오류이며 조용한 annotation으로 무시하지 않는다. 날짜의 형식 검증은 아래 `x-viewstem-type` 또는 명시 날짜 파서로 수행한다. Viewstem의 시간대 없는 time을 표준 RFC 3339 time과 같다고 취급하지 않는다. 프로필 확장은 담당자가 실제 입력·교차 실행기 적합성을 확인해 별도 기록한다. JS 정규식·문자 길이와 Dart 결과가 다르면 실행기 채택 검증에서 실패로 다룬다.

Set/Map과 날짜의 논리 타입은 다음 Viewstem 확장으로 선언한다. 날짜의 공개 표현은 U14의 문자열이지만 일반 string과 다른 검증·정규화 계약을 가진다. `x-viewstem-type`과 표준 `type`은 같은 스키마 객체에서 함께 쓰지 않는다. nullable은 anyOf로 null 스키마와 조합한다.

| 확장 | 선언 필드·검증 |
|---|---|
| `x-viewstem-type: "set"` | items 필수, minItems/maxItems 선택. native membership을 유지하며 uniqueItems로 객체 내용 중복 제거를 하지 않음 |
| `x-viewstem-type: "map"` | keys와 values 스키마 필수, minItems/maxItems 선택. key는 string/number 범위 안에서만 검증 |
| `x-viewstem-type: "date" / "time" / "datetime"` | [U14의 문자열·형식 검사·정규화](10-value-contracts.md#날짜-값과-전송-형식). 일반 string 자동 판별·JS Date 저장·시간대 추측 없음 |

확장 값은 core 전용 검증을 거쳐야 하며, 확장 키를 모르는 일반 JSON Schema 검증기를 통과한 것으로 적합성을 주장하지 않는다. JS/TS Core는 Ajv로 스키마 정의를 검사하고 Viewstem 검증기로 값을 정규화·검증한다. `$defs`와 `typeRef`를 해석한 뒤 확장 타입 계약을 적용한다. 입력값 수용 및 변경 비교에는 U02–U12를 먼저 적용하고, 이 스키마 프로필이 그 의미를 완화하지 않는다.

표준의 어휘·로컬 참조·annotation과 assertion 구분은 [JSON Schema Core](https://json-schema.org/draft/2020-12/json-schema-core), [Validation](https://json-schema.org/draft/2020-12/json-schema-validation)을 기준으로 확인했다. 위 subset과 native 확장은 프로젝트의 위임된 선택이며 표준 자체의 요구라고 표현하지 않는다.

## CEL 실행기 선정과 어댑터 검증

JS/TS Core는 검증한 `cel-js@8.0.0` 수정본을 vendoring해 npm 패키지에 포함한다. [Core CEL 레퍼런스](../core-cel.md)에서 카탈로그, 타입 어댑터와 평가 제한을 확인할 수 있다. Dart 실행기와 교차 적합성은 [후속 범위](../follow-up.md)다.

v1 계산에 네트워크·임의 JS 실행·숨은 전역 상태나 clock 접근을 추가하지 않는다. 미준비 입력이 실제로 필요한 평가 경로의 대기·오류를 검증하며, 선택 포트라는 이유로 임의 null을 주입하지 않는다. 미등록 함수는 컴파일/등록 오류이고 host 확장은 명시 등록한 순수 함수만 허용한다. missing/pending/error 입력은 CEL에 undefined/null로 밀어 넣지 않고 평가 전 준비 상태로 처리한다. native Set/Map·날짜의 CEL 어댑터는 타입 의미를 유지해야 하며, E47의 HTTP 콜백 변환을 CEL 변환으로 재사용한다고 가정하지 않는다. CEL 숫자 종류·오버플로·결과 수용을 [언어 정의](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md)와 core 숫자 계약 양쪽으로 검증한다. 비용 계량·중단을 제공하지 못하는 실행기는 무제한 실행으로 대신 채택하지 않는다. [U13]

### CEL 패치 전제

현재 엔진은 평가별 비용·입출력 제한과 엄격한 `timestamp(string)` 검증을 적용한다. 공개 날짜 정밀도와 내장 함수 범위는 [Core CEL 레퍼런스](../core-cel.md)를 따른다. CEL `matches`에는 RE2 의미를 적용한다. JSON Schema의 `pattern`은 ECMAScript 기준을 유지한다.

[T1 후보 비교](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/t1-experiment-2026-10-29.md), [독립 패치 검증](../../experiments/t1-cel-patch/README.md)과 [생산 재현 절차](../../packages/core/vendor/README.md)에서 선택 이유와 각 검증 범위를 확인할 수 있다.
