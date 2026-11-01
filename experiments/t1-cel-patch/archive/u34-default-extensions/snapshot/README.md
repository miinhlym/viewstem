# CEL 고정 버전 패치 실험

U16의 두 보완 방향을 U34 연속 검증에서 실제로 시험한다. 원본 `@marcbachmann/cel-js@8.0.0`을 덮어쓰지 않고 `.patch`를 별도 복사본에 적용한다. 원본 23개 파일 hash와 패치 후 파일 hash를 모두 검사하며 불일치·patch 적용 실패·fuzz/offset 적용이면 중단한다. MIT 원본 LICENSE도 복사하고 검사한다. 배포 패키지·core 구현이 아니다.

`node run.mjs node24.json`, Node 22 바이너리의 `run.mjs node22.json`으로 Node와 실제 Chromium에서 실행한다. bundler는 verification 폴더의 고정 esbuild, 브라우저는 t2-url-races의 고정 Playwright 설치를 사용한다. 결과는 소스·patch·lockfile hash를 포함한다. `.work/`는 hash로 식별한 생성물이며 원본 수정이나 의존성 설치 파일 편집을 하지 않는다.

## 현재 검증 범위

- 평가마다 독립 예산을 생성하고 AST 진입·함수 인자 크기·연산자 인자 크기·재귀 비교에 비용을 차감한다. 오류 예산은 이후 다시 사용할 수 없고 CEL의 오류 단락 평가에 숨겨지지 않는다. 100,000은 실험용 기본값이며 실제 서비스 보안 한도의 확정치가 아니다.
- default timestamp(string)은 실제 달력·시간·offset·UTC 범위를 검사한다. 이 실험의 Viewstem 프로필은 밀리초까지만 허용하며, 전체 CEL의 nanosecond timestamp 구현을 주장하지 않는다. 초과 정밀도를 잘라 성공시키지 않는다.
- 추가 검사에서 발견한 concurrent parsed quantifier의 undefined 결과, int 최소값 나눗셈/부호 반전 overflow, timestamp 연산의 범위/밀리초 손실, 0099년 시간대 getter를 수정했다. 기존 golden 22개도 확인한다.
- [첫 실패](archive/u34-first-patch/README.md), [추가 경계 실패](archive/u34-deeper-boundaries/README.md)는 수정 전 patch와 결과를 보존한다.

기본 패치의 Node 22/24·Chromium 결과는 각 157/157이었다. 후속 비용·값 제한 검사를 합친 현재 결과는 각 **267/267**이다. [native CEL 어댑터](../t1-native-cel/README.md), [Clock/날짜 연결](../t3-state/README.md), [Dart 값 교차](../t1-dart-values/README.md)는 별도 범위·결과로 관리한다. Dart 값 실험은 Dart CEL 후보의 불일치를 해결하지 않는다. 전체 함수/타입 프로필과 생산 통합의 완료를 주장하지 않으며, JS 네이티브 작업 한 번의 시간을 AST 횟수만으로 제한했다고 보지 않는다. [전체 진행표](../../docs/handoff/verification-ledger.md)를 따른다.

## 추가 비용·수치 경계

초기 157개 뒤 [native RegExp 비용 우회](archive/u34-native-regex/README.md), [duration/int 변환 불일치](archive/u34-duration/README.md)를 추가 재현했다. 당시 227개 검사에서 후속 입력/출력 제한을 추가했다. matches는 [CEL의 RE2 요구](https://github.com/cel-expr/cel-spec/blob/master/doc/langdef.md#regular-expressions)에 맞춰 [RE2JS](https://github.com/le0pard/re2js)의 고정 2.9.1을 사용한다. `npm ci --ignore-scripts --no-audit --no-fund`로 이 실험 의존성을 설치한다. 일반 JS lookaround/backreference를 허용하지 않으며, 전역/receiver 호출·Unicode·부분 매칭·확장 프로그램 비용을 검사했다.

`node regex-probe.mjs regex-node24.json`은 원본 엔진의 300ms Worker 종료를 대조군으로, 패치 엔진의 정상 false 완료를 검사한다. 시작 watchdog과 계산 watchdog을 구별한다. 원본이 기한 내 계산을 마치거나 패치가 끝나지 않으면 대조가 성립하지 않아 실패한다. 성능 benchmark나 모든 입력의 300ms 보장은 아니다.

`duration.getMilliseconds()`는 전체 기간의 ms 환산이 아닌 밀리초 부분값이라는 CEL 계약을 따른다. 음수 기간 산술·0 문자열·큰 날짜 차이의 ns 계산을 정수 연산으로 보완했다. 명시 int(double) 변환도 CEL int64 범위를 검사한다. Viewstem 저장 경계의 JS 안전 정수 검사는 별개로 계속 필요하다.
