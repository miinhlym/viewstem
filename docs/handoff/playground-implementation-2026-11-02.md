# 바닐라 core playground 구현 인계

> 이 문서는 제거 전 리비전의 기록이다. 임시 앱은 U46에서 제거했으며 [현재 제거·검증 범위](temporary-tools-removal-2026-11-04.md)를 따른다. 아래 소스 링크는 당시 리비전으로 고정한다.

U38·D94의 JSON 편집·실행·화면 미리보기·State/Query/Action 관찰을 `playground/`에 구현했다. 실행 방법과 정확한 사용 범위는 [playground README](https://github.com/miinhlym/viewstem/blob/b1d82953ee418def825499e8090c999249cb2d94/playground/README.md), 실행 환경·테스트 이름·해시는 [검증 결과](playground-verification-results.json)가 소유한다. 이 도구는 실제 `@viewstem/core` 공개 진입점을 소비한다.

## 범위와 완료 기준

| 사용자 흐름 | 구현과 확인 기준 |
|---|---|
| JSON 수정·실행 | resources와 inline View 또는 viewRef, inputs를 실제 Registry/runtime에 적용. JSON 정렬·가져오기·내보내기·Cmd/Ctrl+Enter 지원 |
| 미리보기 조작 | 9개 명시 등록 DOM 컴포넌트, State→입력→이벤트→Action→Query→화면 반영. 입력 DOM·포커스·caret 유지 |
| 선언형 화면 | JSON Component 조합, named slot, when 제거·재생성, repeat 투영에 core의 주소·세대 사용 |
| 실행 상태 확인 | View 최상위 State·Derived, Query 상태·stale·결과·오류·refresh/retry, 관찰 ID별 Action 상태·반환값·오류 |
| 오류와 수명 | 잘못된 JSON·참조·스키마 적용 거절 시 기존 실행 유지. 재실행은 새 상태, 중지는 요청·실행·구독 정리. 늦은 이전 결과 차단 |
| 다시 방문 | origin별 로컬 초안 복원. 복원·파일 가져오기만으로 요청을 실행하지 않음 |
| 실제 편집 도구 배치 | 전체 viewport 사용, 두 분할선의 pointer/keyboard 조절·초기화. State/Query/Action/Snapshot/Log 탭. 모바일은 JSON/미리보기/상태 전환 |

외곽 여백·소개 영역·장식 배경·중복 상태 안내를 제거했다. 작은 상단 도구줄과 하단 상태줄만 유지하고 편집기는 전체 높이, 미리보기·상태는 오른쪽 분할 영역을 사용한다. [TypeScript Playground](https://www.typescriptlang.org/play/)의 실행 도구줄·편집/결과 분할·결과 탭을 실제 브라우저로 확인해 배치 참고로 사용했다. 외부 사이트의 코드를 복사하지 않았다.

## 구현 경계

- `app.mjs`: JSON 적용과 runtime 수명, snapshot 구독, 상태 탭·로그·파일·초안.
- `components.mjs`: 공개 Component 계약과 DOM 투영. core의 snapshot을 사용하며 자체 State/Query 엔진을 만들지 않는다.
- `layout.mjs`, `index.html`, `style.css`: 편집 도구 배치, 크기 조절, 접근 가능한 탭·네이티브 입력.
- `samples.mjs`: State/CEL/when, 실제 HTTP/Action/오류, Component/slot/repeat 예제.
- `server.mjs`: 기존 esbuild로 메모리 bundle, loopback HTTP 서버와 지연·실패 fixture. 임의 파일 제공이나 외부 API 프록시 없음.
- `test/playground.test.mjs`: 실제 Chromium UI와 HTTP 검사. CI Node 행렬에 `test:playground` 추가.

새 런타임의 검증된 mount를 얻기 전에는 기존 런타임을 정리하지 않는다. 새 실행 적용 후 초기 Query 실패는 구성 거절과 구별해 관찰할 수 있다. 코드형 컴포넌트는 playground가 등록하며 Svelte의 필수 DOM 계층이나 core 기본 컴포넌트로 승격하지 않는다. core 소스·공개 타입·패키지 의존성은 변경하지 않았다.

## 검증과 증거 보존

검증 결과의 exact test name과 환경은 [별도 JSON](playground-verification-results.json)에 기록한다. 자동 테스트는 데스크톱 viewport 경계·분할 조절·모바일 전환과 JSON 실행 결합 흐름을 함께 검증한다. 실제 스크린샷으로 데스크톱 1512×982와 모바일 390×844의 편집·미리보기·상태 화면을 확인했고, 800×650에서는 분할 최소 크기와 가로 넘침도 검사했다. 브라우저 콘솔의 미처리 오류는 각 테스트에서 실패로 판정한다.

`npm run check`로 현재 manifest에서 core build·제품 테스트·strict 타입·216개 인수 대응을 다시 확인했다. 기존 core 검증 기록의 소스 해시 중 root `package.json`만 달라졌으며 변경 내용은 playground 명령 추가다. 나머지 기록 대상 소스와 dist 산출물은 그대로다. 변경하지 않은 core의 Node 24·브라우저·독립 tarball 증거는 기존 결과를 재사용한다. 기존 실험과 core 검증 JSON은 당시 실행 기록으로 보존한다.

플레이그라운드 검증 중 Snapshot 표시 한도로 잘린 문자열을 완전한 JSON으로 파싱한 테스트와, 성공하도록 고정된 예제 Action에 오류를 기대한 테스트를 수정했다. 각각 표시 내용 검사와 명시적 실패 입력으로 기대를 바로잡았으며 제품 계약을 변경하지 않았다. 로컬 상세 보고서와 화면 이미지는 `playground/test/results/`에 생성되고 Git에서는 제외한다.

### 한국어 IME 입력 후속 수정

사용자의 개념 검색 한국어 입력 제보를 Chromium에서 재현했다. 붙여넣은 `입력`은 정상 HTTP 검색을 수행했지만, `입`을 반영한 뒤 `력`을 조합하는 도중 이전 Query 응답이 도착하면 DOM value를 State의 `입`으로 덮어썼다. 이 쓰기가 브라우저 조합을 끊으면서 compositionend 없이 내부 조합 플래그가 남아 이후 입력까지 무시할 수 있었다. 조합 취소에서도 값 변화 없이 Action을 호출하는 결함을 함께 재현했다.

`components.mjs`가 조합 상태를 렌더링 경로와 공유해 조합 중 value 대입을 보류하도록 수정했다. compositionend와 뒤따르는 최종 input 이벤트는 한 번만 발행하고, 취소는 change를 발생시키지 않으며 조합 중 미뤄진 외부 값이 있으면 반영한다. core·HTTP 엔진 변경은 없다.

[Chromium Input 프로토콜](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl)의 `imeSetComposition`·`insertText`로 브라우저의 실제 조합 처리를 구동했다. 합성 DOM 이벤트로만 조합을 흉내 낸 검증과 구별한다. 추가로 compositionend 뒤 non-composing input이 이어지는 순서를 명시 재현했다. 붙여넣기·URL 인코딩·검색 결과 없음, 응답과 조합의 경합·한 번 확정, 취소·blur 확정·후속 입력, 외부 State 초기화 후 같은 한글 재입력의 네 회귀를 추가했다. 최초 세 재현은 수정 전 1개 통과·2개 실패였고, 실패 메시지·소스 해시와 수정 후 결과는 [검증 JSON의 imeFollowup](playground-verification-results.json)에 보존한다. 이 검증을 실제 운영체제의 모든 키보드·모바일 IME 검증으로 확대하지 않는다.

## 남은 제한

기본 예제와 추가 JSON의 기능별 실행 범위·후속 결함 수정은 [playground 경계 점검](playground-audit-2026-11-02.md), 최신 실행 결과는 [검증 JSON](playground-verification-results.json)을 따른다.

- State·Query·Action 목록은 View 최상위 관찰 범위다. Component 내부 모든 실행 셀을 탐색하는 debugger가 아니다. Snapshot은 표시 한도가 있는 진단이다.
- 미리보기는 등록된 9개 컴포넌트와 이들을 조합한 선언형 Component를 지원한다. Grid·차트 UI, 사용자 JS 코드 편집, 범용 renderer SDK는 포함하지 않는다.
- 편집기는 네이티브 textarea다. JSON 정렬·행 번호·오류 위치·단축키를 제공하며 자동완성·구문 강조·소스 HMR은 포함하지 않는다.
- Chromium을 검증했다. 다른 브라우저, 대형 문서 성능, 실제 모바일 장치의 터치·IME 조합은 별도 검증 대상이다.
- 외부 API는 브라우저의 CORS 정책을 따른다. secret 저장소·로그인 서버·배포 호스팅은 제공하지 않는다.
- Svelte 제품 렌더러, Dart/Flutter, 선택 차트와 원격 공개는 [후속 범위](open-contracts.md#실제-남은-작업)로 유지한다.
