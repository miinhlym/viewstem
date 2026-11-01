# Typed native CEL 독립 실험

기존 opaque Set/Map 단편을 고정 패치 CEL과 실제 `StateProbe` 보호 snapshot에 연결한다. 공개 SDK·core Variable·전체 JSON Schema 어댑터가 아니다. `ProbeSet`, `ProbeMap`, `ProbeObject`, `ProbeDate`와 모든 `probe*` 함수는 **실험 전용 이름**이다.

[CEL 표준 타입](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#values)은 list/map을 정의하며 native Set을 기본 타입으로 제공하지 않는다. 이 실험은 Set을 list로 치환하지 않고 opaque 타입과 명시 함수로 다룬다. Map의 소수 number 키도 native Map으로 유지한다. private WeakMap에 payload를 보관하므로 `.value` 같은 공개 필드로 원본을 노출하지 않는다. 등록된 CEL 타입과 함수만 접근한다.

## 실행

```sh
node experiments/t1-native-cel/run.mjs node22.json
/Users/minholim/.nvm/versions/node/v24.1.0/bin/node experiments/t1-native-cel/run.mjs node24.json
```

Node 22·24 각각 같은 23개 시나리오를 Node와 실제 Chromium에서 실행하고 브라우저 오류 검사 1개를 더해 결과당 47개를 기록한다. Chromium은 기존 `t2-url-races` Playwright, 번들은 공통 `verification` esbuild를 재사용한다. 새 의존성 설치·기존 소스 수정은 없다. `preparePatch()`가 원본·패치 결과 hash를 검증한 고정 CEL을 사용하며 결과에는 patch hash·소스·lockfile·브라우저 버전을 남긴다. 같은 문서/소스가 바뀌면 결과 hash 확인 또는 재실행이 필요하다.

## 지원 typed fixture

- 직접 schema의 integer/number/string/boolean/null, 단일 타입과 null의 anyOf.
- 선언된 properties와 `additionalProperties:false`인 객체, homogeneous array.
- 명시 items의 Set, string/number/integer 키와 명시 values의 Map.
- 명시 `x-viewstem-type` date/time/datetime. public 출력은 기존 값 계약의 정규 문자열이며 일반 string은 자동 날짜 파싱하지 않는다.

기존 `compileSchema`의 등록·값 검증, `trustedCopies`·`protect`의 원본 격리를 재사용한다. CEL int 입출력은 안전 정수↔BigInt 변환, number는 binary64 double로 분리한다. 저장 Set 원소를 별도 입력으로 전달해도 private payload는 같은 저장 객체 참조를 유지한다. 외부 입력은 복사·보호하며 외부 원본의 identity 유지를 주장하지 않는다. CEL list/map literal 출력은 선언된 array/object의 좁은 형태로만 복원한다.

엔진의 `homogeneousAggregateLiterals:false` 옵션을 명시해 혼합 필드 object literal을 허용하고, 출력의 실제 필드는 선언 스키마로 다시 검증한다. opaque 타입의 임의 필드(`s.value`)는 엔진 등록 검사만으로 거절되지 않지만 실행에서 없는 키 오류로 끝나며 payload를 노출하지 않는다. 두 관찰과 초기 실험의 출력 복원/검사 보완 전 37/47 결과는 `results/development-before.json`에 남겼다. 이 파일은 수정 전 소스 hash이므로 현재 소스 검증 증거로 재사용하지 않는다.

`probeSetHas/Size/Same`, `probeMapHas/Get/Same`, `probeField`, `probeDateText/Kind`는 읽기만 한다. MapGet의 없는 key는 오류이고 명시 null은 실제 null이다. 임의 동작을 표준 CEL 함수처럼 제안하는 계약이 아니다. 테스트용 zero-argument `probeGenerated()` 생산자는 신뢰된 동기 host 확장으로, 입력/출력 크기 경계를 검사하기 위한 fixture다.

## 제한과 음성 사례

raw 입력 및 opaque payload를 실제 순회해 node·UTF-8 byte·depth·cycle을 검사한다. 출력이 입력 opaque 타입 그대로여도 payload 크기를 다시 검사한다. producer 출력도 감싸기 전 검사·스키마 검증하며, payload의 size/depth/cycle을 빈 wrapper 크기로 계산하지 않는다. 기본값은 각각 입력/출력 20,000 nodes, 문자열/키 262,144 bytes, depth 64로 기존 guarded 실험과 맞추되 서비스 보안 한도 확정치가 아니다.

고정 패치의 평가별 AST 비용 예산도 유지한다. `N22`는 native 함수가 들어간 반복식에서 낮은 예산을 실제 초과시키고 이후 평가가 새 예산을 받는지 검사한다. payload admission과 AST 비용은 서로 보완하며 신뢰 host callback 내부의 wall-clock 시간을 과금·강제 종료한다고 주장하지 않는다.

`coverage.json`은 부분 인수 근거와 남은 범위를 연결한다. `$ref`/조합 스키마 전체, 임의 schema union, 열린 객체, 모든 날짜·CEL 함수, 비동기 host extension, missing/pending/error 스케줄링, 실제 Variable/Derived 및 Dart는 범위 밖이다. 일반 JSON Schema를 모두 변환하는 어댑터로 사용하면 안 된다. 등록 오류·실행 예산·원본 변이·한도 위반 음성 사례를 통과한 typed fixture 범위로만 해석한다.
