# Chrome 문서 전환 시 사이드바 글자 폭 변화

2026-11-06. 사용자가 Attachment 문서에서 컴포넌트를 하나씩 선택할 때 단어 간격처럼 보이는 움직임을 보고하고 실제 Chrome 확인을 요청했다. 앞선 [누름 효과 수정](sidebar-text.md)은 별도 현상을 다뤘으며 이 문제의 원인이 아니었다.

## 재현과 원인

실제 사용자 Chrome에서 Attachment → Avatar → Badge → Breadcrumb으로 이동했다. 선택하지 않은 `Alert Dialog` 메뉴가 66.4609375px에서 69.8359375px로, `Button Group`은 76.3125px에서 80.09375px로 넓어졌다. `word-spacing: 0px`, `letter-spacing: normal`, CSS font-family와 굵기는 동일했다. CDP의 실제 글리프 검사에서는 후자의 글꼴이 Pretendard가 아닌 `.SF NS` 시스템 글꼴이었다. 따라서 선택 항목의 굵기 변경이나 클릭 시 1px 이동으로 설명할 수 없었다.

`site-theme.css`가 `fonts.css`를 import하여 개발 서버의 SSR 인라인 스타일에 `@font-face`를 함께 넣었다. 이후 Vite 클라이언트는 해당 CSS 모듈을 시작하면서 같은 style의 `textContent`를 다시 설정한다. 이때 이미 사용 중인 FontFace까지 제거·재등록되어 대체 글꼴이 나타난다. CSS font-family 문자열은 같아도 실제 렌더링 폰트가 달라진다. `font-display: optional`만으로는 이미 등록된 FontFace가 다시 만들어지는 경로를 막지 못한다.

별도 설치 Chrome 실행에서도 같은 CSS를 그대로 다시 적용하는 실험으로 66.46875 → 69.84375 → 66.46875px 변화를 재현했다. 기존 검사는 기본 문서 몇 개의 최초 표시만 확인했으므로 컴포넌트 메뉴의 연속 이동과 늦은 CSS 모듈 재적용을 놓쳤다. [새 회귀 검사의 수정 전 실패](font-navigation/before.json).

## 수정

- 폰트 선언 파일의 내용을 바꾸지 않고 `src/styles/fonts.css`에서 `public/fonts/site-fonts.css`로 옮겼다.
- 공통 `FontPreload.astro`가 정적 stylesheet 링크로 이 파일을 로드한다. 제목·공통 탐색에 필요한 Unicode subset preload도 같은 파일을 원본으로 삼는다.
- `site-theme.css`는 폰트 스택·사이트 토큰만 담당한다. Vite가 이 CSS를 다시 적용해도 FontFace에는 영향을 주지 않는다.
- 홈·문서·예제·Playground가 같은 head 컴포넌트를 사용한다. 폰트 파일·Unicode 범위·라이선스·optional 정책·선택 메뉴의 굵기는 변경하지 않았다.

## 검증

- 실제 Chrome에서 Attachment를 연 뒤 Avatar, Badge, Breadcrumb, Bubble, Button Group, Button, Calendar, Card를 순서대로 클릭했다. 매 페이지에서 선택하지 않은 세 메뉴의 폭이 `Alert Dialog=66.4609375`, `Aspect Ratio=72.46875`, `Navigation Menu=96.5390625px`로 유지됐다. Card에서 시간이 지난 뒤에도 같은 값과 실제 `Pretendard Variable`/`PretendardVariable-Regular`를 확인했다.
- 새 `verify-font-navigation.mjs`는 설치된 Chrome을 사용한다. Attachment부터 Combobox까지 15페이지를 한영 각각 실제 링크로 연속 방문하며 최초 paint 이후 프레임의 세 메뉴 폭·높이와 실제 글리프 폰트를 검사한다. 언어별 Vite CSS 동일 내용 재적용 검사도 포함한다. 수정 전에는 Chart 페이지 폭 변경과 강제 CSS 재적용이 실패했고, 수정 후 30페이지 + 2개 재적용 검사가 통과했다. [결과](font-navigation/after.json)

- 기존 폰트 로딩 검사 24건이 통과했다. 홈·문서·예제·Playground의 한영 cold/cached 방문과 문서 폰트 지연·실패 조건을 포함하며, 정적 문서의 최초 표시 이후 글자 위치와 layout shift를 검사한다. [결과](font-navigation/font-loading.json)
- 빌드 결과의 사이드바 스크롤 회귀 검사 10건이 통과했다. 한영·라이트/다크·1024/1440px에서 hydration 전후 스크롤, 새로고침·뒤로가기·그룹 열림 상태를 확인했고, 저장소 접근 실패와 375px 모바일 메뉴도 포함했다. [결과](font-navigation/sidebar-scroll.json)
- 사이트 타입 검사: Astro 88파일 및 Svelte에서 오류·경고 0건. [로그](font-navigation/typecheck.log)
- 정적 빌드: 331페이지 성공. 기존 markdown API deprecation·외부 d3 미사용 import·site 미설정 sitemap 경고는 남아 있다. 배포 HTML의 정적 폰트 stylesheet 링크와 배포된 CSS 내용 일치를 확인했다. [로그](font-navigation/build.log)

개발 서버를 4321에서 재시작했다. 정적 사이트 배포는 수행하지 않았다. Windows·Safari·Firefox의 별도 실행 결과로 확대하지 않는다.
