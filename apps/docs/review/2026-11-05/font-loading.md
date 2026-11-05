# 페이지 이동 직후 글자 떨림 수정

2026-11-05. 대상은 localhost:4321의 라이브러리 사이트다.

## 원인과 수정

기존 `font-display: swap`에서 시스템 대체 글꼴로 표시한 뒤 Pretendard로 교체됐다. Chromium에서 “컴포넌트 세트” 제목 폭 222.84375 → 195.25px, y 130.796875 → 132.796875px 변화를 재현했다. 로딩 이후 가만히 둔 사용자 Chrome 탭은 10초·602프레임 동안 위치·폰트·테마가 안정적이었다.

- Pretendard·D2Coding을 `optional`로 변경해 늦게 도착한 폰트로 읽는 중인 문장을 교체하지 않는다. 느린 연결의 첫 방문에서는 해당 페이지에서 시스템 대체 글꼴을 유지할 수 있다.
- `FontPreload.astro`는 기존 CSS Unicode 범위에서 제목과 공통 메뉴에 필요한 부분 파일을 골라 preload한다. 기본 D2Coding도 preload한다. 전체 한글 92개 부분 파일이나 굵은 코드 파일을 모두 요청하지 않는다.
- 홈·예제·Playground의 head와 Starlight의 기본 Head를 보존한 override에 같은 컴포넌트를 적용했다.
- 시스템 문자 폰트를 기호 보완 폰트보다 앞에 둔다. 느린 연결에서 기호 폰트가 뒤늦게 공백의 폭·기준선에 관여하는 현상도 방지한다. 누락 기호를 보완하는 Noto Sans Symbols 2는 `swap`을 유지한다.
- 폰트 파일·글리프·라이선스는 변경하지 않았다. 화면 숨김, JavaScript 폰트 대기, 강제 새로고침은 추가하지 않았다.

참고: [Chrome의 optional + preload 설명](https://web.dev/articles/preload-optional-fonts). 제목과 본문은 로딩 완료 후 보이는 모습만이 아니라 최초 표시부터 관찰했다.

## 검증

`node apps/docs/scripts/verify-font-loading.mjs`는 한·영 홈·문서 개요·컴포넌트 목록·예제·Playground의 첫 방문과 캐시 재방문 20개, 문서의 폰트 응답 600ms 지연과 다운로드 실패 4개, 총 24개 조건을 실행했다. 문서 12개 조건에서 최초 표시 후 관측한 제목·첫 본문·코드·헤더 위치가 동일했고 layout-shift 항목은 0개였다. 예제 목록 4개 조건도 같은 결과다. 홈의 기존 진입 애니메이션과 Playground hydration의 화면 이동은 별도로 기록하며 전체 사이트 CLS 0이라고 주장하지 않는다.

실제 글리프 렌더러도 CDP로 확인했다. `한글 English → ✓ ⠿ 😀`에서 본문은 Pretendard, 코드는 D2Coding, 보완 기호는 Noto Sans Symbols 2와 시스템 폰트, 이모지는 Apple Color Emoji를 사용한다. 문서 사이트 타입 검사, 프로덕션 빌드, 로컬 링크 29,146개 검사도 통과했다. 자세한 프레임·폰트·경로별 결과는 [font-loading-verification.json](font-loading-verification.json)에 있다. 이번 브라우저 검증은 macOS Chromium이며 Firefox·WebKit은 실행하지 않았다.
