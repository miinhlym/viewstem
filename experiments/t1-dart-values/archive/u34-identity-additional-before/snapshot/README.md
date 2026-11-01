# JS–Dart VM 값 경계 독립 실험

동일 golden fixture를 실제 JS·Dart host 값으로 만든 뒤 정규화·직접 스키마 검증·보호 읽기·준비 상태·날짜 변환을 비교한다. Dart core·전체 JSON Schema·Dart CEL 구현이 아니다. `fixtures.json`의 `$fixture`, `$set`, `$map`, ref ID는 **테스트 구성/관찰 전용 태그**이며 production wire 형식을 정의하지 않는다. Dart는 태그를 기대값으로 바꾸지 않고 실제 Set/Map/DataObject/Future/DateTime 등을 만든 다음 normalizer와 validator를 실행한다. undefined·sparse hole에는 Dart에 대응 언어 값이 없어 private sentinel을 사용하며 null과 구별한다.

## 실행

```sh
cd experiments/t1-dart-values
dart pub get --enforce-lockfile
dart analyze
cd ../..
node experiments/t1-dart-values/run.mjs node22.json
/Users/minholim/.nvm/versions/node/v24.1.0/bin/node experiments/t1-dart-values/run.mjs node24.json
```

95개 hand-authored golden에 JS·Dart 각각 기대값 검증과 양쪽 결과 비교를 적용한다. 결과당 285개 검사이며 `results/dart-node*.json`에는 Dart VM의 실제 관찰값을 따로 보존한다. JS는 기존 StateProbe/schemaRuntime/private typed native CEL adapter와 고정 CEL patch를 재사용한다. Dart는 `cel` 패키지를 사용하지 않는다. 기존 `../t1-values/results/dart.json`의 cel 0.6.1 후보 불일치 7개를 고쳤다고 주장하지 않으며 원본 파일과 hash를 그대로 둔다.

첫 교차 실행의 279/285 결과는 `results/development-before.json`과 `development-dart-before.json`에 보존한다. Dart fixture 원본의 추론된 `List<DataObject>`에 int를 추가하던 검사 오류와 JS 시간대 gap/overlap 예외의 category 매핑 누락을 고쳤다. 두 파일의 hash는 수정 전 소스를 가리키므로 현재 구현의 통과 증거로 재사용하지 않는다. public package config URI의 trailing slash 처리 누락으로 집계 파일 생성 전 중단됐던 runner도 수정했다.

## 지원 범위

직접 type scalar·array·object properties/required/additionalProperties·native Set/Map items/keys/values·null 단일 분기 anyOf·date/time/datetime만 검증한다. Dart validator는 이 fixture subset 밖의 키를 거절한다. 일반 JSON Schema 등록/조합/$ref/모든 날짜/함수 변환을 지원하지 않는다. JS와 Dart의 동일한 value 오류는 실험 category로 정리하며 public 오류 DTO/API를 새로 정하지 않는다.

Dart 객체 데이터는 Map과 구별한 private DataObject를 쓰며 identity equality를 유지한다. native Set은 그 객체 참조로 membership을 판단하고 Map은 string/number 키를 유지한다. 입력은 복사하고 저장된 object/list/set/map을 재귀 보호한다. 변경 없는 읽기 참조와 과거 snapshot을 유지하며 외부 원본은 수정·동결하지 않는다. 모든 number는 binary64로 받아 유한성을 검사하고 integer는 안전 정수 범위를 별도 검사한다. 일반 데이터 BigInt·Function·Future·DateTime은 거절한다. 명시 실행 결과의 Future를 await하는 경계와 일반 데이터 수용 경계를 분리한다. integer bridge의 내부 BigInt 계산은 명시 변환 후 안전 정수 결과로 재검증한다.

## 날짜와 시간대

[DateTime.parse](https://api.dart.dev/dart-core/DateTime/parse.html)는 범위 밖 날짜를 이월할 수 있으므로 형식·달력·시간·offset·밀리초·연도 범위를 직접 검증한 뒤 UTC로 변환한다. YY의 00/68/69/99와 0099년·0001년·UTC 연도 이탈을 포함한다. 일반 string은 자동 파싱하지 않는다.

[Dart labs timezone 0.11.2](https://pub.dev/packages/timezone/versions/0.11.2)를 고정한다. 패키지 README의 오래된 데이터 버전 표기 대신 실제 `lib/data/latest.dart` generated header와 파일 hash를 결과에 기록한다. 각 zone의 가능한 offset을 구해 UTC 후보를 지역 시각으로 왕복 검사하며 후보가 0개(gap) 또는 2개 이상(overlap)이면 거절한다. Asia/Seoul·America/New_York 대표 사례만 검증하며 전 세계/역사 전체/DST 전체 검증이 아니다. Node ICU/tzdata와 Dart embedded tzdata가 다르다는 사실도 결과에 남긴다.

`coverage.json`은 source·test ID·부분 상태·남은 검증을 연결한다. VM 버전·lockfile·소스 hash·Dart actual 결과 hash·실제 tzdata hash를 결과에 기록한다. Flutter/web/Dart CEL 후보 채택이나 인수 C12 전체 완료를 뜻하지 않는다.
