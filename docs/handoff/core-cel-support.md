# JS/TS core CEL 지원 범위

2026-11-02 생산 모듈 첫 이관. 이 문서는 `packages/core/src/cel/index.mjs`의 실제 지원 범위를 설명한다. 전체 CEL 명세, Dart 실행기, 전체 core/renderer의 적합성 완료를 뜻하지 않는다. 기존 `experiments/`와 archive는 수정하지 않았다.

## 공개 진입점

```js
const evaluate = compileCel('size(items) + 1', {
  inputs: { items: { type: 'array', items: { type: 'integer' } } },
  output: { type: 'integer' },
});
evaluate({ items: [1, 2] }); // 3 (동기)
```

`compileCel(expression, { inputs, output?, functions?, limits?, cost? })`는 동기 평가 함수를 반환한다. `evaluateCel(expression, bindings, options)`는 같은 경로의 편의 함수다. 파싱·이름/함수 검사·입출력 스키마 등록은 compile 시점에 한다. 입력은 선언한 이름과 정확히 일치해야 하며 값 수용/정규화·보호 후 평가한다. 출력도 선언 스키마로 검증·보호한다. 실패를 기본값으로 대체하지 않는다. 오류 DTO 연결은 이 모듈을 사용하는 core 경계가 담당한다.

`output` 생략은 공통 스키마 `true`다. `null` 스키마를 생략과 동일하게 취급하지 않는다. 입력이 없는 식에는 `{}`를 전달하거나 bindings를 생략한다. Variable의 missing/pending/error 의존성 수명과 Clock 공급은 이 함수 밖에서 관리한다.

호스트 확장은 `functions: [{ name, inputs: Schema[], output: Schema, run(...nativeArgs) }]`다. 콜백은 보호된 공개 값을 받고, 결과는 스키마 검증 후 CEL 값으로 인코딩한다. 비동기·thenable 결과는 `ASYNC_CEL_FUNCTION` 오류다. 확장은 신뢰된 순수 동기 코드여야 하며 임의 JS의 실행시간·부작용을 격리하는 sandbox가 아니다. 콜백이 반환한 잘못된 값·크기 오류는 CEL의 논리 단락으로 숨길 수 없다.

## 값과 스키마

공통 `compileSchema`의 전체 v1 수용 프로필을 사용한다. boolean schema, 로컬 `$ref`/`$defs`, `allOf`/`anyOf`/`oneOf`, `not`, 조건부 schema, union type, 객체 추가 속성, tuple의 `prefixItems`를 실험의 `SCHEMA_OUTSIDE_TYPED_FIXTURE`로 거절하지 않는다. 스키마 admission과 별개로 CEL에서 가능한 실제 연산은 인코딩 타입에 따른다.

- numeric 위치가 모든 가능한 분기에서 integer로 제한되면 JS 안전 정수↔CEL int(BigInt)로 연결한다. `number`는 double이며 값이 우연히 정수여도 int로 바꾸지 않는다. 스키마가 숫자 종류를 결정하지 못하는 `true`, 무타입 schema, integer/number 혼합 분기는 입력 JS number를 double로 인코딩한다. 출력의 명시 integer는 CEL double을, 명시 number는 CEL int를 거절한다. 종류를 정하지 않은 출력은 CEL int를 JS 안전 정수로 복원하며 범위 밖 결과를 거절한다.
- 객체는 일반 CEL map이므로 `obj.field`/`obj["field"]`를 사용한다. 배열은 표준 list다. CEL map literal은 string key만 가진 공개 객체로 복원하며, native Map을 literal로 암묵 생성하지 않는다.
- native Set/Map은 private WeakMap payload의 opaque 타입이다. Set을 list로, Map의 소수 number key를 CEL int key로 바꾸지 않는다. `setHas`는 저장된 객체/배열 참조를 유지하고 새 동일 내용 객체/list를 같은 원소로 취급하지 않는다. 원본 외부 객체를 다시 전달했을 때 저장 참조와 같다는 보장은 없다.
- Set/Map의 `==`/`!=`, `setSame`/`mapSame`은 공통 타입별 `equal`을 사용한다. Set 삽입 순서와 Map 삽입 순서는 무시하며 Map value는 재귀 비교한다. DateValue의 동등성은 종류와 정규 문자열을 함께 비교한다.
- 명시 date/time/datetime은 수용 경계에서 정규화하고 CEL 안에서는 opaque DateValue로 구별한다. `dateText`로 정규 문자열을 읽는다. 일반 string을 날짜처럼 보인다는 이유로 파싱하지 않는다. JS Date 입력과 CEL timestamp/Duration 자체의 공개 출력은 거절한다. 날짜 schema의 출력과 명시 달력 함수는 공개 정규 문자열 계약을 따른다.

## 함수·구문 목록

정확한 signature 목록은 [supported-functions.json](../../packages/core/src/cel/supported-functions.json)에 있다. 71개 후보 엔진 signature(매크로 포함)와 19개 native/달력 signature다. 후보 엔진의 더 큰 기본 목록 108개는 [upstream-function-catalog.json](../../packages/core/vendor/upstream-function-catalog.json)이며 공개 목록과 구별한다.

| 범위 | 공개 함수 |
|---|---|
| 기본 변환/크기 | `dyn`, `bool`, `int`, `double`, `string`, 전역/receiver `size` |
| 문자열 | `startsWith`, `endsWith`, `contains`, `lowerAscii`, `upperAscii`, `trim`, `indexOf`, `lastIndexOf`, `substring`, 전역/receiver `matches`, `split`, list `join` |
| 표준 내부 시간 연산 | `timestamp`, `duration`, timestamp의 `getDate`, `getDayOfMonth`, `getDayOfWeek`, `getDayOfYear`, `getFullYear`, `getHours`, `getMilliseconds`, `getMinutes`, `getMonth`, `getSeconds`; duration의 `getHours`, `getMinutes`, `getSeconds`, `getMilliseconds` |
| 매크로 | `has`, list의 `all`, `exists`, `exists_one`, `map`(2/3 인자), `filter` |
| native Set | `setSize`, `setHas`, `setSame` |
| native Map | `mapSize`, `mapHas`, `mapGet`, `mapSame`; key 인자는 CEL int/double/string |
| 명시 날짜 | `dateText`, `dateKind` |
| 달력 | `localDate(epochMs: int, zone: string)`, `addDate(date: string, days: int)`, `atLocal(date, time, zone)`, `startOfDay(date, zone)`, `nextDayStart(date, zone)`, `parseYY(string)` |

문자열 확장은 CEL 표준 환경과 구별한다. 위치는 Unicode 코드포인트 단위이며 ASCII case 함수는 비ASCII 문자를 그대로 둔다. `matches`는 RE2JS **2.9.1**을 사용하며 JS lookaround/backreference를 지원하지 않는다. `mapGet`의 없는 key는 `REFERENCE_NOT_FOUND`, 명시 null은 실제 null이다. native payload의 `.raw`/`.value` 같은 속성은 공개하지 않는다.

일반 CEL 산술/비교/논리·조건식·list/map literal·index/field 접근을 지원한다. `bytes`와 byte literal, `uint`와 uint literal, `type` 반사, optional namespace/type/구문, `cel.bind`는 compile 시점에 거절한다. 미실행 분기에 있어도 허용하지 않는다. 해당 이름과 bytes/optional 전용 method 이름은 호스트 확장에서도 사용할 수 없다. 기본 후보가 등록했다는 이유로 미검증 bytes JSON·optional 확장을 공개하지 않았다.

timestamp/duration은 내부 CEL 중간값을 계산하는 기능이며 Viewstem의 date/time/datetime과 자동 상호 변환하지 않는다. timestamp는 이 패치의 밀리초 정밀도·연도 0001–9999 프로필이며 CEL 전체 나노초 timestamp 지원이 아니다. timestamp getter의 인자 생략 UTC 의미는 CEL 표준 시간 연산이다. 업무 달력 함수는 별도로 IANA zone 인자를 필수로 받으며 숨은 로컬 시간대를 쓰지 않는다. DST 중복/누락 시각은 오류다. `addDate`는 정수 일수만 받으며 `nextDayStart`는 24시간 경과량을 더하지 않는다. YY는 00–68→2000–2068, 69–99→1969–1999다.

## 제한과 재현성

기본 `celLimits`: expressionChars=65536, inputNodes=20000, outputNodes=20000, valueBytes=262144, depth=64. 모두 양의 안전 정수이며 알 수 없는 limit은 거절한다. 기본 `cost=100000`, AST node 한도 10000이다. 이 값은 초기 구현 기본값이며 임의 서비스의 보안 상한 또는 실행시간 보장이 아니다.

입력/출력의 실제 native payload까지 node·UTF-8 byte·depth·cycle을 검사한다. 평가별 비용 예산은 AST 진입·엔진 함수/연산자 인자·비교를 차감하며 native 함수/동등성은 숨겨진 payload graph도 차감한다. cost와 host 결과 크기 초과는 CEL 오류 단락으로 숨겨지지 않는다. 입력과 출력의 각 제한은 별도다. 신뢰된 호스트 콜백 내부의 임의 루프나 단일 JS/Temporal 작업 시간을 선점하지 않는다.

`npm ci --ignore-scripts` 후 `node packages/core/scripts/prepare-cel.mjs`로 원본 manifest 23개 파일을 확인하고 두 패치를 무fuzz/offset 적용한다. 중간 패치 manifest와 최종 25개 manifest를 확인한 뒤 vendored 소스와 대조한다. 소스가 이미 있어도 재생성 임시 결과와 기존 파일을 모두 검사하며, 다른 내용의 기존 파일을 덮어쓰지 않는다. 알 수 없는 추가 vendored 파일도 거절한다. 원본 MIT LICENSE를 그대로 보존한다. 런타임에는 Node API 또는 experiments 경로를 import하지 않는다.

| 패치 | SHA-256 |
|---|---|
| 검증된 실험 패치 `cel-js-8.0.0.patch` | `62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63` |
| 생산 통합 보완 `production-fixes.patch` | `ae10b2b12750ee2f6d75d0c2592f57a4b3b8dee8a3159b901965ed1fbfafcf26` |

생산 보완은 전역/receiver 함수가 동일 handler에 서로 다른 호출 규약의 `__handle`을 캐시하던 결함만 제거한다. 전역 `matches(s,p)` 뒤 receiver `s.matches(p)`를 검사·실행할 때 `ev.chargeArguments is not a function`이 발생했다. handler 공유 캐시 대신 AST마다 호출 adapter를 만들어 두 순서와 `size` 공유 overload를 회귀 검사한다. 원본 고정 패치와 그 검증 기록을 수정하지 않았다.

## 실행 검증

```sh
node --test packages/core/test/cel.test.mjs
node packages/core/test/cel-browser.mjs
```

2026-11-02 Node **22.21.1**, **24.1.0** 각각 공개 API **16/16 테스트 그룹** 통과. 한 그룹은 생산 vendor를 대상으로 기존 candidate 회귀 **216/216**을 실제 실행한다. catalog 일치, hash 재빌드, 정수/double, 일반 객체, 조합/ref/tuple/열린 schema, native Set identity·Map 소수 key·보호·동등성, 날짜/달력/DST, 등록 실패, 호스트 비동기/잘못된 결과, 입력/출력/depth/cost 제한, RE2, 전역/receiver 호출 순서를 포함한다.

별도 browser script는 production src/vendor를 esbuild로 browser IIFE bundle한 후 기존 고정 Playwright **1.62.1**을 테스트 드라이버로만 재사용한다. 위 Node 두 버전에서 각각 Node **25/25**, 실제 Chromium **151.0.7922.34 25/25**, pageerror **0**. 런타임 bundle에는 실험 모듈이 포함되지 않는다. 이 25건은 CEL 제품 경계의 브라우저 검사이며 모든 engine overload의 브라우저 전수 적합성 검사나 성능 benchmark가 아니다.

등록 catalog는 목록 일치를 입증하며 모든 overload의 모든 경계값을 입증하지 않는다. 전체 CEL 표준 적합성·다른 브라우저·Dart·시간대 DB 버전 간 교차 결과·임의 호스트 코드 격리는 남은 제한이다. core 전체 패키지 build/typecheck/HTTP/registry 통합 결과는 해당 담당 검증 기록을 따른다.
