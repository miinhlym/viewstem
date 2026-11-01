# T1 값·타입 실행기 실험 결과

> 이 문서는 해당 날짜·단계의 기록이다. 아래 미실행·후속·보류 표기를 현재의 승인 대기로 적용하지 않는다. 최신 계약·독립 검증 완료는 [U34–U35 진행표](verification-ledger.md), 새 채팅의 구현 시작과 U36 커밋 범위는 [현재 인수인계](implementation-start.md#새-채팅에서-시작할-때)를 따른다.

기준일: 2026-10-29. U15의 승인 범위는 **재실행 가능한 실험과 결과 정리**다. core·렌더러·서비스 구현은 계속 보류한다. [실험 코드·명령](../../experiments/t1-values/README.md), [원시 결과](../../experiments/t1-values/results/latest.json), [Node 24 대조 결과](../../experiments/t1-values/results/node24.json)를 함께 남긴다.

아래는 U15 당시 결과이며 직접 날짜 어댑터의 후속 수정·회귀는 [U32 기록](boundary-followup-2026-10-30.md)을 따른다.

## 판단

**JSON 데이터 검증은 Ajv 8.20.0을 다음 구현의 우선 후보로 삼을 근거가 생겼다. CEL은 최종 채택하지 않는다.** Ajv와 Hyperjump는 이번 표준 subset 사례에서 동일한 결과였고, Ajv에 별도 값 경계를 연결한 프로토타입이 동작했다. 우선순위는 실험에서 확인한 연결 경로에 따른 것이며 속도·번들 크기 우열이나 전체 JSON Schema 적합성을 주장하지 않는다.

JS CEL의 후속 조사 우선순위는 `@marcbachmann/cel-js`다. 공개 등록 검사와 custom type/function으로 정수·Set identity·소수 Map key를 보존하는 경로를 확인했다. 하지만 계산 비용 계량과 엄격한 날짜 함수 경계가 해결되지 않았다. `@bufbuild/cel`도 비교 후보로 유지하며, Dart `cel 0.6.1`은 이번 범위에서 동일 계약의 실행기로 채택할 수 없다. 언어로서 CEL을 선택한 결정은 바꾸지 않는다.

## 실행 범위와 결과

직접 버전은 Ajv 8.20.0, Hyperjump JSON Schema 1.18.0, marcbachmann CEL 8.0.0, Buf CEL 0.6.1, Temporal polyfill 0.5.1, Dart CEL 0.6.1이다. macOS arm64의 Node 22.21.1(ICU 77.1, tz 2025b)과 Node 24.19.0(ICU 78.3, tz 2026a), Dart VM 3.11.1에서 실행했다. 두 Node 환경의 관찰 결과 294개가 같았다. 이 수에는 후보별 비교·원본 보존·부적합 재현도 포함하므로 **294개 core 테스트가 통과했다는 뜻이 아니다.**

| 구분 | 실행 결과 | 의미 |
|---|---|---|
| JSON Schema 대표 24개 × 2 후보 | 48/48 기대값 일치 | boolean/type, 숫자·문자열·객체·배열 제약, enum/const, 논리 조합, 조건 분기, local $ref. 별도의 입력 불변 검사도 48/48 |
| 공통 CEL 22개: marcbachmann | 21/22 일치 | 잘못된 날짜를 정상 날짜로 바꾸는 1건 불일치 |
| 공통 CEL 22개: Buf | 21/22 일치 | 같은 날짜 불일치. 등록 검사·native 입력은 별도 아래 결과 |
| 공통 CEL 22개: Dart cel | 15/22 일치 | 혼합 숫자 연산·오버플로·has/filter/timestamp/type/uint 차이 |
| 미등록 함수/변수·잘못된 연산 등록 검사 | marcbachmann 3/3 거절, Buf 0/3 거절 | Buf의 공개 parse→plan으로는 등록 시 타입/함수 검증을 충족하지 못함 |
| Set·소수 key Map 직접 입력 | marcbachmann 2/2, Buf 0/2 | 직접 전달의 차이. 어느 쪽도 전체 native 적합성 증명 아님 |
| 실험용 값·날짜·정수·opaque 컬렉션 어댑터 | 93/93 assertion 통과 | 상세 범위는 실험 README. core 상태 반영·통지·수명 검증 제외 |
| 지연 missing/pending/error 입력 | 결과 12/12, 접근 횟수 12/12 일치 | 실행하지 않는 조건 분기에서 미준비 입력을 읽지 않음. 준비 상태 전체 어댑터 완료 아님 |
| 긴 계산/정규식 Worker 종료 | 3/3 실제 종료 | Node Worker에서 실행 시작 뒤 200ms deadline으로 종료. 비용 카운터는 아님 |
| raw Ajv의 core 계약 누락 재현 | 2건 모두 재현 | unsafe integer와 모르는 native 확장은 별도 guard 없으면 수용 |

오류 기대 사례는 오류 발생 여부만 비교한다. 예를 들어 Dart C18은 timestamp 미지원으로 오류를 낸 것이므로 날짜 검증 성공을 뜻하지 않는다. 오류 코드/원인의 완전한 호환성은 별도 미검증이다.

Dart 정적 분석과 formatter 검사를 통과했다. 고정 lockfile로 다시 설치하고 위 명령으로 재현할 수 있다. 모든 CEL fixture의 입력/기대값은 [공통 JSON](../../experiments/t1-values/fixtures/cel.json)에 있으며 결과 파일은 값·오류를 구별해 보존한다.

## 실제로 발견한 경계

1. **core integer와 CEL int 사이에 명시 어댑터가 필요하다.** JS `2`를 그대로 넘기면 CEL double이고 `n + 1`은 int literal과 타입이 달라 두 후보에서 오류다. integer 선언을 검사한 뒤 BigInt로 넘기고 안전 범위 결과만 JS Number로 되돌리는 경로는 성공했다. 일반 number를 값이 정수처럼 보인다는 이유로 int로 바꾸지 않는다. 외부 BigInt 데이터 거절과 실행기 내부 int 표현을 구별한다.
2. **native Set/Map을 JSON 전송 형태로 CEL에 넣으면 의미를 잃을 수 있다.** 소수 key `1.5`와 문자열 key `"1.5"`를 구별하고, 같은 내용의 서로 다른 객체를 Set에서 구별하는 opaque type/function 경로를 확인했다. 이 실험의 함수 이름은 최종 공개 카탈로그가 아니다. CEL 표준 map의 key 범위와 core의 모든 유한 number key 범위가 같다고 가정하지 않는다.
3. **날짜 입력 검증만으로 CEL 내부 함수까지 안전해지지 않는다.** 두 JS 실행기의 `timestamp("2026-02-30T00:00:00Z").getDate()`는 오류 대신 2를 반환하며 3월 2일로 이월했다. 엄격한 별도 날짜 파서는 이를 거절했고 명시 등록 함수로도 거절했다. 그러나 사용자가 원래 timestamp를 직접 부르는 경로는 여전히 남는다. 날짜 함수 허용 목록·교체/차단을 검증하기 전에는 해결됐다고 표시하지 않는다. marcbachmann의 동일 timestamp signature 재등록은 중복 오류였으므로 단순 덮어쓰기 가능성을 가정하지 않는다.
4. **Dart의 넓은 정수 지원이 동일 계산 의미를 보장하지 않는다.** `9223372036854775807 + 1`은 JS 두 후보에서 오류였지만 Dart 후보에서는 `-9223372036854775808`을 반환했다. `double + int`도 JS는 거절하고 Dart 후보는 계산했다. has/filter 등의 미구현까지 있어 출력값만 변환하는 어댑터로 충분하지 않다.
5. **계산량 제한과 시간 제한은 다른 요구다.** 확인한 JS 공개 옵션에는 runtime operation/cost budget이 없었다. marcbachmann의 AST 크기 제한은 실제 거절했지만 짧은 식의 큰 중첩 반복을 막지 못한다. 별도 Worker를 실제 종료하면 긴 계산과 backtracking 정규식을 끊을 수 있지만, Promise.race 또는 Worker deadline만으로 비용 계량까지 만족했다고 처리하지 않는다.

날짜의 UTC 정규화, date/time 보존, 윤년/형식 거절, 명시 Asia/Seoul, DST gap/overlap 거절, 23시간인 달력 하루, 기기 시간대 변경 무관성을 실험했다. Node의 서로 다른 ICU/tz 버전에서도 **이 fixture**는 동일했으며 모든 지역·과거 시점의 동일성을 보장하지 않는다. JSON 문자열 왕복만 확인했으며 실제 HTTP/URL 어댑터는 T2에 남는다.

## 필요한 어댑터와 남은 검증

| 경계 | 확인한 경로 | 남은 완료 조건 |
|---|---|---|
| 값 수용 | 재귀 undefined/비유한 값/순환 거절·-0 정규화·원본 격리 | 모든 스키마 조합·중첩 native·공유 참조·읽기 보호와 원자 State 반영 |
| Schema | subset 등록 guard → 정규화 → Ajv 검증 | native 확장과 $defs/분기 조합 컴파일, 스키마 동등성, Dart Schema 후보. 무제한 정규식 실행 차단 |
| CEL 숫자·출력 | 선언 integer의 내부 int 변환, 안전 결과 반환 | 중첩 선언·union·uint·모든 반환 타입, 값 크기/출력 크기 제한 |
| CEL Set/Map | custom type·순수 함수로 identity/key 보존 | 전체 허용 연산과 출력 복원, 읽기 보호, Dart 동등 구현 |
| CEL 준비 상태 | 조건부 지연 접근 확인 | missing/pending/error의 DTO·오류 분류, dependency 재평가와 취소 |
| 날짜 | 엄격 파서·명시 시간대·순수 함수 | CEL 기본 날짜 함수 우회 방지, 함수 목록, Dart 시간대/날짜 어댑터, 실제 HTTP/URL 연결 |
| 실행 제한 | AST 크기 거절·Node Worker 실종료 | **실제 비용 계량과 중단**, 모든 허용 연산의 계량, 브라우저 적용·입출력/메모리 한도 |

재설치 재현 중 Worker 시작이 지연되어 기존 10초 시작 watchdog에 걸린 실행도 있었다. [실패 기록](../../experiments/t1-values/results/startup-timeout.json)을 보존하고, 필요한 실행기만 불러오도록 줄였으며 시작 watchdog과 실제 계산 deadline을 분리했다. 시작 제한은 30초이고 실제 계산 시작 후 200ms에 종료를 요청한다. 호스트 스케줄링·종료 지연 때문에 정확히 200ms 이내 종료하는 실시간 보장은 아니며, 결과에 startupMs/executionMs를 따로 기록한다.

T1은 **부분 검증** 상태다. U15 실험 뒤 남긴 비용 계량·중단과 허용 함수 통제는 계속 검증 대상이다. 후속 U16/D72에서는 [cel-js의 계산 제한·날짜를 패치하는 전제](../spec/03-variable-type.md#cel-패치-전제)로 다음 논의에 진행하기로 했다. 이는 위 원시 결과를 변경하거나 패치가 실행됐다는 뜻이 아니다. 실제 검증 없이 현재 후보를 production 기본 실행기로 고정하지 않으며, 기존 값 계약 완화나 core 본 구현 승인으로 처리하지 않는다.

## 확인한 1차 자료

버전은 설치한 package/lockfile 기준이며 아래는 후보의 공개 API·표준을 확인한 위치다. 채택 판단은 홍보 설명보다 위 실제 결과를 우선했다.

- [Ajv 2020-12 지원](https://ajv.js.org/json-schema.html), [데이터 변경 옵션](https://ajv.js.org/guide/modifying-data.html)
- [Hyperjump JSON Schema](https://github.com/Hyperjump-io/json-schema)
- [marcbachmann CEL API](https://github.com/marcbachmann/cel-js), [Buf CEL](https://github.com/bufbuild/cel-es)
- [Dart cel](https://pub.dev/packages/cel), [CEL 언어 정의](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md)
- [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill)
