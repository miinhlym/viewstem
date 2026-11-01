# CEL 고정 버전 패치 실험

U16의 두 보완 방향을 U34 연속 검증에서 실제로 시험한다. 원본 `@marcbachmann/cel-js@8.0.0`을 덮어쓰지 않고 `.patch`를 별도 복사본에 적용한다. 원본 23개 파일 hash와 패치 후 파일 hash를 모두 검사하며 불일치·patch 적용 실패·fuzz/offset 적용이면 중단한다. MIT 원본 LICENSE도 복사하고 검사한다. 배포 패키지·core 구현이 아니다.

`node run.mjs node24.json`, Node 22 바이너리의 `run.mjs node22.json`으로 Node와 실제 Chromium에서 실행한다. bundler는 verification 폴더의 고정 esbuild, 브라우저는 t2-url-races의 고정 Playwright 설치를 사용한다. 결과는 소스·patch·lockfile hash를 포함한다. `.work/`는 hash로 식별한 생성물이며 원본 수정이나 의존성 설치 파일 편집을 하지 않는다.

## 현재 검증 범위

- 평가마다 독립 예산을 생성하고 AST 진입·함수 인자 크기·연산자 인자 크기·재귀 비교에 비용을 차감한다. 오류 예산은 이후 다시 사용할 수 없고 CEL의 오류 단락 평가에 숨겨지지 않는다. 100,000은 실험용 기본값이며 실제 서비스 보안 한도의 확정치가 아니다.
- default timestamp(string)은 실제 달력·시간·offset·UTC 범위를 검사한다. 이 실험의 Viewstem 프로필은 밀리초까지만 허용하며, 전체 CEL의 nanosecond timestamp 구현을 주장하지 않는다. 초과 정밀도를 잘라 성공시키지 않는다.
- 추가 검사에서 발견한 concurrent parsed quantifier의 undefined 결과, int 최소값 나눗셈/부호 반전 overflow, timestamp 연산의 범위/밀리초 손실, 0099년 시간대 getter를 수정했다. 기존 golden 22개도 확인한다.
- [첫 실패](archive/u34-first-patch/README.md), [추가 경계 실패](archive/u34-deeper-boundaries/README.md)는 수정 전 patch와 결과를 보존한다.

기본 패치의 Node 22/24·Chromium 결과는 각 157/157이었다. 후속 비용·값 제한 검사를 합친 이 단계 결과는 각 **267/267**이었다. 기본 노출 확장 보완 후 현재 결과는 각 **433/433**이다. [native CEL 어댑터](../t1-native-cel/README.md), [Clock/날짜 연결](../t3-state/README.md), [Dart 값 교차](../t1-dart-values/README.md)는 별도 범위·결과로 관리한다. Dart 값 실험은 Dart CEL 후보의 불일치를 해결하지 않는다. 전체 함수/타입 프로필과 생산 통합의 완료를 주장하지 않으며, JS 네이티브 작업 한 번의 시간을 AST 횟수만으로 제한했다고 보지 않는다. [전체 진행표](../../docs/handoff/verification-ledger.md)를 따른다.

## 추가 비용·수치 경계

초기 157개 뒤 [native RegExp 비용 우회](archive/u34-native-regex/README.md), [duration/int 변환 불일치](archive/u34-duration/README.md)를 추가 재현했다. 당시 227개 검사에서 후속 입력/출력 제한을 추가했다. matches는 [CEL의 RE2 요구](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#regular-expressions)에 맞춰 [RE2JS](https://github.com/le0pard/re2js)의 고정 2.9.1을 사용한다. `npm ci --ignore-scripts --no-audit --no-fund`로 이 실험 의존성을 설치한다. 일반 JS lookaround/backreference를 허용하지 않으며, 전역/receiver 호출·Unicode·부분 매칭·확장 프로그램 비용을 검사했다.

`node regex-probe.mjs regex-node24.json`은 원본 엔진의 300ms Worker 종료를 대조군으로, 패치 엔진의 정상 false 완료를 검사한다. 시작 watchdog과 계산 watchdog을 구별한다. 원본이 기한 내 계산을 마치거나 패치가 끝나지 않으면 대조가 성립하지 않아 실패한다. 성능 benchmark나 모든 입력의 300ms 보장은 아니다.

`duration.getMilliseconds()`는 전체 기간의 ms 환산이 아닌 밀리초 부분값이라는 CEL 계약을 따른다. 음수 기간 산술·0 문자열·큰 날짜 차이의 ns 계산을 정수 연산으로 보완했다. 명시 int(double) 변환도 CEL int64 범위를 검사한다. Viewstem 저장 경계의 JS 안전 정수 검사는 별개로 계속 필요하다.


## 기본 노출 확장 보완과 카탈로그 한계

[기본 카탈로그](function-catalog.json)는 제공받은 `/tmp/viewstem-cel-function-catalog.json`의 전체 목록을 이관하고 새 패치의 `new Environment().getDefinitions()`와 대조했다. 108개 정의 항목에는 macro 10개가 **포함**된다(일반 overload 98 + macro 10). `catalog.mjs`는 목록·순서·변수·macro·패치 hash와 실제 기본 옵션 `enableOptionalTypes: false`를 검사한다. 목록에 optional 메타데이터가 남는 것과 기본 namespace/선택 문법 활성화는 다르다. `node catalog.mjs catalog-node22.json` 또는 Node 24 바이너리로 재현하며 각 6/6이다.

카탈로그는 각 항목을 CEL 표준 환경/표준 macro, cel-go 문자열 확장, cel-js bytes·namespace 확장, 기본 비활성 optional로 구분하고 검증 범위를 표시한다. **현재 후보가 기본 등록하는 목록의 관찰이며 Viewstem v1 공개 함수 목록 승인이나 전체 CEL 적합성 승인이 아니다.** 목록에 있는 함수의 모든 overload 경계를 검증한 것으로 보고하지 않는다. bytes JSON의 scalar/list 반환, 숫자 정밀도·prototype·잘못된 UTF-8 및 optional opt-in 의미는 이 변경의 미검증 범위다.

[cel-go 공식 문자열 확장](https://github.com/cel-expr/cel-go/blob/master/ext/strings.go)의 `indexOfOffset`/`lastIndexOfOffset`/`substrRange`/`lowerASCII`/`upperASCII`/`split`/`trimSpace`를 기준으로 현재 기본 노출 확장을 보완했다. 이들은 [CEL 표준 환경](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#standard-environment)과 구별한다. 조회한 원문 URL·sha256·의미와 관련 Go 표준 라이브러리 근거는 [의미 근거](semantic-references.json)에 남겼다.

- ASCII 대소문자 변환은 비ASCII 문자를 그대로 둔다.
- 검색·substring 위치는 Unicode 코드포인트 단위다. 검색 offset 음수는 오류이고, 빈 검색은 길이로 clamp한다. 비어 있지 않은 검색의 끝/초과 offset은 -1이다. substring은 음수·역전·초과 범위를 거절한다.
- 검색의 각 문자 비교에 비용을 차감해 반복 near-match가 예산을 우회하지 못한다. 기존 함수 인자 크기 비용 검사도 유지한다.
- 빈 구분자 split은 코드포인트를 보존하며, trim은 Unicode White_Space에 따라 NEL(U+0085)을 제거하고 BOM(U+FEFF)을 보존한다. trim은 양끝을 선형으로 스캔한다.
- cel-js 자체 `bytes.json()`의 브라우저 TextEncoder.decode 오타를 TextDecoder로 수정했다. 객체·중첩·Unicode 정상 처리와 잘못된 JSON의 SyntaxError를 Node와 실제 Chromium에서 검사했다. CEL 표준 bytes 함수 지원 약속을 추가한 것은 아니다.

[확장 독립 회귀](extension-cases.mjs)는 각 런타임 83개이며 기존 133개와 함께 총 `216 × 2 + browser 오류 검사 1 = 433`개다. [Node 22](results/node22.json), [Node 24](results/node24.json)는 실제 Chromium을 포함해 각각 **433/433**, 새 패치 대상 정규식 Worker 대조도 각 **2/2**다. [수정 전 archive](archive/u34-default-extensions/README.md)는 이전 patch/hash, 원본·수정 전 소스, 기존 267 결과와 새 회귀의 수정 전 353/433 결과를 보존한다. `.work`의 기존 hash build는 수정하지 않았고, 임시 복사본에서 functions.js를 수정해 원본과 diff를 만든 뒤 `preparePatch()`의 무fuzz/offset·전체 25개 hash 검사를 통과했다. native/Dart/Clock/교차 suite는 새 patch hash에 대한 별도 재실행 증거를 따른다.
