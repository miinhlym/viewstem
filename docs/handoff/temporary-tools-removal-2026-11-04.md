# 임시 확인용 앱 제거 — 2026-11-04

U46·D103에 따라 임시 core playground와 shadcn 갤러리를 제거한다. 사용자에게
로컬 편집기·미리보기 앱을 실행하도록 안내하는 것을 제품 사용 흐름으로 두지 않는다.
core·Svelte renderer·shadcn UI 패키지는 유지하며, 통합 방법은 패키지 README가 소유한다.

## 제거와 유지의 경계

- `playground/`의 실행 앱·바닐라 DOM 어댑터·HTTP mock 서버·편집기·안내와 도구 테스트를 제거한다.
- `playground`, `test:playground` npm 명령과 CI의 playground 단계를 제거한다.
- 공개 README·기여 안내·이슈 재현 안내·문서 지도에서 두 도구의 사용을 권하지 않는다.
- shadcn 카탈로그·키보드·State/Query/Action·IME 검사는 실제 빌드 패키지를 직접 마운트하는
  테스트 fixture로 옮긴다. 화면 선택·편집·공유 URL·inspector용 DOM은 테스트에 복제하지 않는다.
- 화면 조합용 순수 ViewSpec 데이터와 State 작성 보조만 test fixture로 유지한다.
  새 기본 컴포넌트나 별도 상태 엔진을 추가하지 않는다.
- 기존 작은 Svelte 컴포넌트 등록 예제는 이번 두 도구 제거 대상에 포함하지 않는다.

## 검증 항목의 변화

삭제된 도구의 검사를 계속 통과한 것처럼 세지 않는다. 정확한 폐기·이관 목록과
새 실행 결과는 [검증 기록](temporary-tools-removal-results.json)에 둔다.

Playground의 41개 검사는 함께 폐기한다. 정적 대조에서 23개는 일부 core/Svelte 계약의
기존 제품 테스트를 찾았고, 18개는 주로 제거된 편집기·서버·바닐라 어댑터에 해당했다.
이는 부분 계약 대응이며 동일 E2E 대체 증거가 아니다. HTTP·DOM·한글 IME·포커스의
동일한 조합을 다른 패키지 테스트가 전부 재현한다고 주장하지 않는다. 해당 바닐라
어댑터는 제품 API로 제공하지 않으며 구현 자체를 제거한다.

UI 검사는 66개 family의 필수 동작 68개와 카탈로그 전체 등록·실제 조합을 유지한다.
종류별 편집·갤러리 외곽 배치·페이지 전환처럼 제거된 앱만 검증하던 사례는 폐기하고,
제품 상태나 콜백에 대한 검사는 직접 mount·replace·snapshot 관찰로 이관한다.
도구 전용 UI 검사 9개를 제거해 전체 UI 검사는 117개에서 108개가 되었다.
브라우저 파일은 11개에서 10개로 줄고, 기존 4개 shard에 정확히 한 번씩 배정한다.

## 과거 증거 보존

작업 기준은 `517503d72db30ed3363b7fd61285f480870fce79`다. 과거 검증 JSON·로그·실험은
수정 전 리비전의 증거로 유지한다. 제거 경로를 가리키던 역사 문서의 소스 링크는
마지막 공개 리비전 `b1d82953ee418def825499e8090c999249cb2d94`로 고정했다.

기존 `playground/test/results/`의 ignored 파일 49개는 삭제 전에
`.git/ci-evidence/remove-demos-2026-11-04/playground-results-original/`로 옮기고 전체
SHA-256 일치를 확인했다. 제거할 앱 디렉터리의 untracked 파일은 없었다.
과거 CI 최적화·preflight의 117개 UI 및 41개 playground 결과는 당시 범위의 수치이며,
현재 제거 후 검증 수로 읽지 않는다.

## 실행 검증

`npm run test:ci`는 Node 22.21.1과 24.1.0에서 각각 14개 통과했다.
`npm run test:svelte:package`도 통과해 갱신한 README를 포함한 설치 패키지의
타입·브라우저 소비자 동작을 확인했다.
workflow는 `actionlint`, 변경한 JavaScript는 `node --check`로 확인했다.
패키지 런타임·공개 타입·의존성·lock과 core/Svelte 제품 테스트 소스는 기준 커밋과 같다.
이번에 실행하지 않은 core·Svelte 전체 회귀를 새 실행 결과로 집계하지 않는다.

## 범위와 제한

- 제거한 경로를 사용하는 실행 import·npm 명령·현재 사용 안내를 남기지 않는다.
- 삭제된 도구의 사용자 흐름은 더 이상 지원·검증하지 않는다. 일부 계약 대응은 동일 E2E 검증을 뜻하지 않는다.
- 원격 CI·새 성능 수치는 이번 로컬 검사만으로 통과를 주장하지 않는다.
