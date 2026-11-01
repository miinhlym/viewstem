# T1 값·타입 실행기 실험

core 구현에 앞선 독립 실험이다. StateStore·Query·Action·렌더러·공개 SDK를 구현하지 않는다. 실제 값 계약은 [현재 명세](../../docs/spec/10-value-contracts.md)를 따르며 이 폴더의 함수 이름은 공개 API가 아니다.

## 실행

Node 22 이상과 Dart 3.8.1 이상이 필요하다. 실제 확인 환경은 Node 22.21.1/24.19.0, Dart 3.11.1, macOS arm64다.

```sh
cd experiments/t1-values
npm ci --ignore-scripts --no-audit --no-fund
cd dart
dart pub get --enforce-lockfile
cd ..
npm test
cd dart
dart analyze
dart format --output=none --set-exit-if-changed bin/probe.dart
```

직접 의존성과 lockfile을 고정했다. 설치에는 패키지 저장소 연결이 필요하지만 fixture 실행은 실제 서비스·API를 호출하지 않는다. runtime 의존성은 이 private 실험 패키지에만 있다.

`npm test`는 후보의 적합/부적합 결과를 모두 출력하고 [results/latest.json](results/latest.json)을 갱신한다. **종료 코드 0은 후보 전체 채택이나 core 테스트 통과를 뜻하지 않는다.** 실험용 어댑터, 검증 중 원본 보존, 실제 Worker 종료의 assertion이 실패하거나 실행 자체가 깨지면 비정상 종료한다. 후보의 예상 계약과 다른 결과는 `MISMATCH`와 `matches:false`로 보존한다. 전체 판정은 [실험 결과와 후속 작업](../../docs/handoff/t1-experiment-2026-10-29.md)을 따른다.

## 구성과 범위

| 파일 | 실험 내용 |
|---|---|
| [schema-probe.mjs](schema-probe.mjs) | 같은 JSON Schema 2020-12 대표 24개를 Ajv/Hyperjump로 실행, 입력 불변성 확인. 미지원 키워드·외부/순환 참조의 등록 전 guard 증명 |
| [fixtures/cel.json](fixtures/cel.json) | JS 2종·Dart 1종에 공통 적용하는 22개 golden 입력/기대값. int/double/uint 구별을 유지하는 실험용 태그 |
| [cel-probe.mjs](cel-probe.mjs) | 결과/오류·등록 검사·직접 Set/Map 전달·명시 어댑터를 별도 비교 |
| [values.mjs](values.mjs) | 정규화·직접 스키마·날짜·CEL 정수 변환·opaque 컬렉션의 제한된 프로토타입 |
| [limit-worker.mjs](limit-worker.mjs) | 긴 CEL 중첩 반복과 정규식 검증을 별도 Worker에서 200ms 이후 실제 종료 |
| [dart/bin/probe.dart](dart/bin/probe.dart) | 동일 CEL fixture를 Dart VM에서 실행. Flutter 앱이나 Dart 웹 실행 증명 아님 |
| [run.mjs](run.mjs) | 전체 실행, 결과 수집, 프로토타입 assertion |

`acceptDirect`는 직접 스키마와 properties/items, nullable native 타입만 실험한다. 모든 조합/로컬 참조에서의 정규화, 중첩 native 값, 타입 동등성, 읽기 보호, State의 원자 쓰기·snapshot·통지·재평가는 구현하지 않았다. 임시 객체 복사와 원본 보호가 전체 State 수명 계약을 증명하지 않는다.

`setSize/setHas/mapGet/checkedDatetime`은 등록한 순수 확장 함수의 실험 이름이다. Set을 목록으로, 소수 Map key를 문자열로 몰래 변환하지 않는다. 이 확장 성공이 원래 CEL timestamp의 잘못된 날짜 수용이나 전체 함수 허용 목록을 해결한 것은 아니다.

missing/pending/error 실험은 지연 입력을 실제로 읽는지 측정한다. 프로덕션 준비 상태 DTO·오류 분류·재평가 스케줄러까지 구현한 것은 아니다. Worker 종료는 wall-clock 격리 증명이며 연산 비용 계량, 브라우저 Worker, 모든 입력 크기/메모리 상한, 악의적 신뢰 코드의 sandbox를 증명하지 않는다.

`results/node24.json`·`results/latest.json`은 현재 U32 회귀 실행의 Node 24/22 결과다. `node run.mjs node24.json`처럼 출력 이름을 지정할 수 있으며 생략하면 latest.json이다. [수정 전 소스·원시 결과](archive/u15-before-date-boundaries/README.md)를 별도 보존한다. 2026-10-29 기록에서는 Node 22/24의 294개 관찰 결과가 같았으며 실행 시간만 달랐다. 시간은 시작/종료 overhead를 포함하고 성능 비교 지표로 쓰지 않는다.

## U24: 배열 크기 집중 검증

`node array-size-tests.mjs array-size-node24.json`으로 고정된 cel-js 8.0.0의 `size(items)`/`items.size()`와 기존 안전 정수 결과 변환을 실행한다. Node 22에서는 해당 바이너리와 `array-size-node22.json`을 사용한다. [Node 22 결과](results/array-size-node22.json)와 [Node 24 결과](results/array-size-node24.json)는 각각 18/18 통과했다. 빈/중복/null/중첩/객체/10,000개 배열, 조건식·필터 결과를 포함하며 입력 불변성도 확인했다. 이는 기존 전체 T1 결과를 덮어쓰지 않는 별도 집중 검사다. 실제 core/renderer·Dart·브라우저 CEL·native Set/Map·성능·비용 제한을 검증한 것은 아니다. [현재 계약](../../docs/spec/03-variable-type.md#배열-크기-계산)과 [U24 HTTP 경로 연계 기록](../../docs/handoff/t2-http-boundary-2026-10-29.md)을 따른다.

## U32 직접 날짜 경계 보완

`node date-boundaries.mjs date-boundaries-node24.json`으로 날짜 정규화 후 const/enum/pattern/문자열 길이·nullable, 잘못된 날짜, 지역 시각→UTC 연도 범위, DST gap/overlap을 검사한다. Node 22 바이너리에서는 `date-boundaries-node22.json`을 사용한다. 각각 **39/39** 통과했다. 날짜 정규화 후 나머지 스키마 제약 검사와 지역 시각 변환 결과의 범위 검사를 보완했으며 [수정 전 21/39 결과](archive/u32-date-before-fix/README.md)를 보존했다.

기존 T1 전체 회귀의 294개 관찰 판정은 두 Node 버전 모두 이전과 같고, 어댑터 93/93·CEL 크기 18/18도 유지했다. 새 전체 결과는 실행 소스·lockfile SHA-256을 포함한다. 기존 CEL 후보/Dart 불일치는 해결된 것으로 표시하지 않는다. [후속 기록](../../docs/handoff/boundary-followup-2026-10-30.md)을 따르며 전체 스키마/native 조합·CEL 내부 날짜 패치·실제 HTTP/URL 날짜 연결을 구현한 것은 아니다.

## U34 등록·복합 스키마 후속 검증

[등록 검사](schema-registration.mjs) 78/78, [복합 스키마 실험](schema-runtime-tests.mjs) 83/83을 Node 22/24에서 실행했다. `node schema-registration.mjs schema-registration-node24.json`, `node schema-runtime-tests.mjs schema-runtime-node24.json`으로 재현한다. 일반 JSON 부분은 Ajv와 3,036개 입력/스키마 조합을 비교했다. 미지원 keyword, native 선언, 날짜의 단일 정규화, 로컬 ref, 중첩 safe integer와 native 자료형을 검사한다. 임의 스키마 분석 완전성·core 구현을 뜻하지 않는다.

U32 날짜 fixture의 type과 native 표식 동시 선언은 명세 위반이었다. 해당 fixture와 [과거 결과](archive/u34-before-schema-profile/README.md)를 보존하고 native 표식만 쓰는 유효한 선언으로 39/39를 다시 확인했다. 이제 acceptDirect도 선언 guard를 먼저 거친다. 기존 제한된 acceptDirect와 새 독립 compileSchema 실험의 범위를 구별한다.

[HTTP/URL 날짜 연결](../verification/date-integration.mjs)은 별도 실험이며 Node와 실제 Chromium에서 정규 문자열 왕복·대상 스키마 재검증을 수행한다. 최신 범위와 잔여는 [전체 진행표](../../docs/handoff/verification-ledger.md)에 기록한다.
