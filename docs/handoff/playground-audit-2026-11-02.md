# Playground 실행·경계 점검

사용자의 여러 구성 직접 실행·예외·기획 적합성 점검 요청에 따라, 기본 예제 3종과 별도 JSON 구성을 실제 Chromium에서 실행했다. 대상은 현재 playground의 공개 기능 전체이며, core 전체 인수 검증과 별개다. 본 기록의 범위 밖 모든 입력·브라우저에 결함이 없다는 보장은 아니다.

## 실행 방법과 범위

[기본 시나리오](../../playground/test/playground.test.mjs)와 [추가 경계 시나리오](../../playground/test/edge-cases.test.mjs)는 편집기에 JSON을 넣고 실행 버튼·미리보기 입력·Query 도구·탭을 조작한다. 실제 공개 패키지, DOM, loopback HTTP를 사용하며 내부 State를 직접 변조해 결과를 만드는 검사는 아니다. Node 22/24의 정확한 버전·통과 수·test name·소스 해시는 [검증 결과](playground-verification-results.json)의 `browser`와 `auditFollowup`에서 관리한다.

| 점검 대상 | 직접 실행한 입력과 관찰 기준 | 결과 |
|---|---|---|
| 기본 예제 3종 | HTTP 검색/Action, State/CEL/when, 재사용 Component/slot/repeat | 각 예제의 입력과 화면·관찰 상태 연결 확인 |
| JSON 등록·적용 | inline View, viewRef/inputs, 문법 오류, 존재하지 않는 참조, 잘못된 schema/envelope, builtin 중복, repeat key 중복, UTF-8 한도 초과 | 정상 구성 적용; 적용 거절은 기존 실행 유지 |
| 입력 4종 | TextInput의 한글 조합·붙여넣기·후속 입력, NumberInput의 음수·음수 소수·소수·지수·빈 편집·blur, Checkbox, disabled Button | State·값·포커스·이벤트 실행 일치; 중간 숫자 초안과 조합 보호 |
| 계산·미준비 입력 | 필수 Variable 입력의 missing→Derived pending→ready, 0으로 나눌 때 Derived error→정상 입력 복구 | 미준비 UI 비활성; 오류 관찰과 노드 복구 확인 |
| Query | 빠른 검색어 연속 변경, 실제 HTTP 오류와 stale, retry, executeWhen 차단·해제, polling 재개·중단·수동 갱신 | 최종 입력 결과 유지, 오류 복구, 폐기 뒤 요청 정지 |
| Action | 실행 중/성공/실패, false 반환, 연속 클릭, SetState 뒤 Assert 실패와 재시도 | 실행 중복 제한, 완료된 State 쓰기의 비롤백, 같은 연결 재시도 후 오류 표시 정리 |
| 구성·수명 | Card header/default/footer, 같은 key 재정렬 중 IME, 항목 제거·재추가, when 제거·재생성 | 슬롯 순서, 인스턴스·입력 보존, 제거 후 새 수명 확인 |
| 실행 교체 | 정상 재실행, 진행 중 Query/Action 교체, 중지 뒤 재실행, 이전 응답 늦게 도착 | 새 실행 초기화·이전 세대 발행 차단 |
| 파일·초안 | exact draft export, import 후 명시 실행, 읽기 지연 중 편집/다른 파일 선택, 큰 파일, localStorage 거절 | 최신 편집 보존·저장 불가 상태에서도 실행 가능 |
| 관찰 도구 | State/Derived·Query·Action, missing/null/false, Snapshot/Log 탭, 100건 로그, 긴 값 표시 한도, 미리보기 노드 한도 | 관찰 값 구분, 한도 표시와 정상 구성으로의 복구 |
| 배치·키보드 | 데스크톱·모바일 전환, 방향키/포인터 분할 조절, Cmd/Ctrl+Enter, Shift+Tab, 도움말, 320×568/390×844/800×650/844×390/1280×800/1512×982 | 페이지 넘침 없이 도구 접근; 실제 이미지에서 미리보기·상태 영역 확인 |
| 로컬 서버 | 정적 파일 allowlist, 메서드·delay 범위, 오류 fixture, 잘못된 request target `//[` | 404/405/400/503 처리; 잘못된 주소 뒤에도 서버 유지 |

Stack·Row·Card·Text·TextInput·NumberInput·Checkbox·Button·Json의 9개 미리보기 어댑터가 위 실행에 포함된다. Component 내부 State는 공개 snapshot의 입력·하위 화면과 실제 편집 보존을 통해 확인했다. 최상위 inspector를 내부 전체 debugger로 취급하지 않는다.

## 발견한 결함과 수정

| 항목 | 수정 전 관찰 | 수정 |
|---|---|---|
| 숫자 초안과 State 불일치 | 숫자 입력을 비우고 포커스를 옮겨도 공란이 남고 State에는 이전 값 유지 | 편집 중 숫자 표기 보존; blur 시 현재 State 값으로 동기화. 음수 소수·지수 회귀 포함 |
| 복구한 오류의 잔류 | Action 재시도·Query gate 해제 후 성공해도 이전 오류 배너 유지 | 오류를 발생한 이벤트 연결/Query에 연결하고 같은 실행 경로의 복구 시 정리. 다른 연결의 성공으로 지우지 않음 |
| 반복 재정렬의 IME 중단 | 같은 key의 입력 DOM을 insertBefore로 이동하면 포커스 이탈 | 포커스가 있는 하위 트리를 유지하고 형제 노드를 이동. 브라우저별 새 DOM API에 의존하지 않음 |
| 파일 가져오기 경합 | 먼저 선택한 파일을 늦게 읽으면 이후 편집 내용을 덮어씀 | 초안 revision·파일 선택 순서를 확인하고 오래된 결과와 오류 무시 |
| 표시 오류와 실행 표시 모순 | 3,000개 노드 표시 한도 초과 배너가 있는데 실행 상태는 ready | 오류 표시를 실행 상태에 반영하고 해당 표시가 정상 복구될 때 해제 |
| 비정상 URL로 서버 종료 | `//[` request target이 URL 생성 예외를 내고 서버 exit 1 | 요청 파싱 예외를 400 응답으로 처리; 뒤 요청 정상 처리 회귀 추가 |

기존 core 계약을 바꾸는 수정은 없다. DOM 어댑터·playground 실행 상태·파일 편집 수명·로컬 서버가 변경 경계다. 변경하지 않은 core 소스·산출물 해시를 다시 대조하고 기존 core 테스트·타입·인수·패키지 증거를 재사용했다.

## 실패 증거와 테스트 보정

최초 추가 14개 시나리오에서는 7개 통과·7개 실패를 관찰했다. 이 중 미준비 입력 사례는 선택 Value 포트의 **missing**을 **pending**으로 잘못 기대한 fixture였다. 필수 Variable 입력이 준비되지 않은 Derived를 연결하도록 바꾸자 수정 전 코드에서도 통과했다. 이를 제품 결함 수에 포함하지 않는다. 나머지 실패 메시지, 수정 전 소스 해시, 별도 서버 종료 재현은 검증 JSON의 `auditFollowup.before`에 보존한다. 원본 로컬 자료는 `playground/test/results/audit-before/`에 있고 Git에서는 제외한다.

IME 검사는 CDP로 Chromium의 조합 처리를 구동한다. 파일 읽기 경합은 실제 File.text의 완료만 의도적으로 지연해 재현했다. 서버 종료 재현은 별도 자식 프로세스에서 수행해 사용자가 보고 있는 서버와 분리했다. 이 통제 조건과 일반 실제 HTTP/DOM 실행을 구별한다.

## 플레이그라운드 전체 변경 preflight

`f5a8564..8777942`의 구현·테스트·문서 3개 커밋, 23개 파일 전체를 검토했다. 원격 `origin/main`은 fetch 후에도 `af86b95`이므로 이전 core 작업까지 포함한 원격 diff와 이번 플레이그라운드 검토 범위를 구별한다. 작업 시작 시 staged·unstaged·untracked 변경은 없었다. 이번 범위의 완료 판단을 앞선 core 커밋 전체에 대한 새 검토로 확대하지 않는다.

검토 범위는 실행·DOM·배치·예제·서버 7개 파일, 브라우저 테스트 2개 파일, 실행 명령·CI·ignore 3개 파일, 사용법·계약·인수·결정 이력·검증 기록 11개 파일이다. 공개 core API 사용, 취소·교체·IME·파일 읽기 경합, 텍스트 삽입 경계, localhost 서버의 경로 제한, 키보드 조작, 문서의 지원 범위와 검증 연결을 함께 확인했다. 불필요한 구조 변경이나 지원 범위 변경은 하지 않았다.

새로 재현한 결함은 **주소가 없는 `when`/`repeat` 대기 노드의 DOM 키 충돌**이다. 두 입력이 미준비일 때 둘 다 `undefined:undefined` 키로 저장되어 안내 하나가 사라졌다. 실제 패키지와 브라우저를 사용하는 회귀에서 수정 전 실패를 확인했다. 미리보기 어댑터는 주소가 없는 진단 노드를 각 snapshot 객체별로 구별하고, 주소·세대가 있는 실제 인스턴스만 snapshot 사이에 DOM을 유지하도록 수정했다. 별도 slot의 두 대기 안내와 각각의 준비 완료를 검증했다. core·공개 타입·의존성 변경은 없다.

수정 후 `npm run test:playground`와 Node 24의 같은 브라우저 suite, 구문 검사, 문서 링크, `git diff --check`를 확인했다. 정확한 실행 수·실패 전후 보고서·소스 해시는 [검증 결과](playground-verification-results.json)의 `preflight`와 `browser`가 소유한다. 변경하지 않은 core의 기록 대상 소스 128개와 산출물 8개 해시를 대조해 기존 검증을 재사용했다.

설정 회귀도 확인했다. `playground/test/*.test.mjs`는 기본·경계 테스트 두 파일만 포함하고, `test/results/`의 수정 전 사본·보고서·화면 이미지는 테스트 glob과 Git 추적에서 제외된다. 두 npm 명령은 먼저 core를 빌드하며, CI는 `npm ci --ignore-scripts`·core 검사·Chromium 설치 뒤 playground 검사를 수행한다. 기존 lockfile·workspace·core 패키지 포함 파일은 바뀌지 않았다. 원격 CI는 push 후 확인할 후속 gate이며 이번 실행에서 수행하지 않았다.

## 검증 경계

- 브라우저는 Chromium이다. 다른 엔진과 실제 모바일 장치의 터치·키보드·IME는 미검증이다.
- 위 크기 한도·로그 경계는 확인했지만 장시간 실행·고부하·대형 문서 성능 보장은 아니다.
- 네트워크는 로컬 fixture다. 실제 서비스의 CORS·인증·secret·권한 정책은 해당 환경의 후속 검증 대상이다.
- 범용 renderer SDK, Grid·차트 UI, Svelte·Dart/Flutter는 이 playground의 지원 목록에 포함하지 않는다.
- 이번 범위의 최종 회귀에는 미해결 재현 실패가 없다. 새로운 입력이나 환경이 추가되면 관련 범위를 다시 확인한다.
