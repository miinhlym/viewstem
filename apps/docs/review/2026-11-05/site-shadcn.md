# 사이트 기본 UI의 shadcn/ui 적용

2026-11-05 · D127. 대상은 사이트 자체의 UI이며, 라이브러리 `svelte-ui` 컴포넌트를 재설계하는 작업이 아니다. [공식 Astro 설치](https://ui.shadcn.com/docs/installation/astro)와 [테마](https://ui.shadcn.com/docs/theming)를 기준으로 React 통합·Tailwind·공식 CLI 컴포넌트를 설치했다. 소스·버전·라이선스는 [사이트 upstream](../../upstream/README.md)에 있다.

## 적용 목록

| 영역 | 실제 사이트 컴포넌트 | 유지한 역할 |
|---|---|---|
| 공통 헤더 | Button, DropdownMenu, Sheet | 로고·한영 전환·현재 페이지·시스템/밝게/어둡게 선택 |
| 홈 | Button, Table | 설명·코드·필터 흐름, 장식용 카드 추가 없음 |
| 문서 | Dialog, Input, Collapsible, Sheet, Breadcrumb, Pagination, DropdownMenu | Pagefind 검색·66개 계열 링크·현재 문서·목차·키보드/포커스 |
| 문서 옵션 | Field, Input, Checkbox, NativeSelect, Button | JSON·실제 UI 연결, IME, 유효성, 복사·재실행·복원 |
| 예제 목록·실행 | Collapsible, Sheet, Tabs, Button, Pagination | 파일 선택, 코드 편집·실행·초기화·이전/다음 |
| Playground | Button, Alert, Resizable | 초안 유지·수동 실행·오류 복구·키보드 크기 조절 |

사이트용 컴포넌트는 `apps/docs/src/components/ui`에 있다. 사이트의 Button은 공식 Button을 Astro 링크/속성에 연결하는 얇은 어댑터이며, 별도 모양을 재구현하지 않는다. 기존 사이트 색상은 기본 Neutral 토큰으로 전환했다. Pretendard/D2Coding 서체와 콘텐츠의 읽기용 레이아웃은 유지한다. CodeMirror 편집기는 사이트 토큰으로 배경·선택·줄 번호·JSON 구문 색상을 맞춘다. 문서 본문과 코드 블록은 기존 읽기·구문 강조 도구를 사용한다.

`@viewstem/svelte-ui` import는 실제 JSON 실행 경로와 미리보기용 stylesheet에만 남는다. 문서 옵션과 Playground 조작부의 Svelte 컴포넌트는 React로 바꿨지만, 미리보기 renderer와 공개 API는 그대로다. 기존 D125/D126의 Svelte 미리보기 출처 계약은 유지하고 사이트 옵션 UI 선택만 D127로 대체한다.

## 통합에서 수정한 문제

- Astro 6.4.8의 Vite 7과 최신 React integration의 Vite 8 transform이 개발 서버에서 충돌했다. 호환되는 `@astrojs/react@5.0.3`으로 고정했다.
- 글로벌 Tailwind preflight가 Starlight 프레임 여백을 초기화해 본문이 사이드바 뒤로 들어갔다. base → Starlight → utility 순서를 첫 stylesheet에서 선언했다. 라이브러리 미리보기의 scoped CSS 층은 별도로 유지한다.
- 작은 화면에서 기존 가로 탐색을 그대로 두면 헤더가 넘쳤다. 실제 Sheet로 공통 사이트 메뉴를 제공하며 문서 탐색 Sheet와 역할을 구분한다.
- React island 초기화와 SSR/streamed HTML의 순서를 고려해 기존 DOMContentLoaded 대기와 렌더러 세션 계약을 유지했다. 예제 파일 탭과 CodeMirror는 명시적 이벤트로 상태를 공유한다.

## 검증

- [사이트 매트릭스](site-shadcn/site-ui.json): 홈·문서·예제 목록·예제 실행·Playground × 한영 × 밝음/어둠 × 320/1440px. 실제 테마 메뉴와 모바일 사이트 Sheet·포커스·파일 탭·넘침·오류를 검사한다.
- [문서 탐색](site-shadcn/navigation.md): 실제 한영 Pagefind 결과와 섹션, 검색·메뉴 키보드, 현재 항목, 전체 계열 링크, 개발 색인 안내.
- [옵션](site-shadcn/options.json): 8계열의 64조합과 3개 추가 흐름 묶음, IME·복원·SSR·빠른 변경 포함.
- [미리보기](site-shadcn/demos.json): 한영 132페이지의 실제 실행·표시 JSON·전체 메뉴·모바일·대표 상호작용.
- [원본 스타일 회귀](site-shadcn/library-styles.json): Svelte 미리보기 66계열 × 2폭 × 2테마에서 기존 독립 oracle의 21속성 비교. 사이트용 React 컴포넌트를 이 검사 대상으로 혼동하지 않는다.

최종 결과: 사이트 40/40조합, 옵션 64조합+추가 3흐름, 한영 미리보기 132/132페이지 통과. 라이브러리 스타일 264/264조합 차이 0건. 전체 workspace 타입 검사 통과 후 목차·편집기 보완분에 대해 docs를 다시 검사해 95파일 오류·경고·hint 0을 확인했다. Astro 정적 빌드와 335 HTML·40,902 내부 링크 검사는 오류 0이다. [사이트 무결성](site-shadcn/site-integrity.json), [모바일 목차·테마 유지·편집기 실행](site-shadcn/toc-editor.json)을 함께 보존한다. 데모 세션 단위 테스트도 4/4 통과했다.

공통 CSS 레이어 수정 뒤 전체 화면을 다시 확인했고, 이후 목차와 편집기 보완은 사이트 40조합·목차/편집기 검사로 재검증했다. 옵션과 미리보기 source·관련 CSS가 바뀌지 않은 검증 결과는 재사용했다. 이전 브라우저 matrix의 즉시 포커스/탭 상태 단언은 Radix의 비동기 업데이트 완료를 기다리도록 수정했다. 색상은 퍼센트/소수의 동치 표기를 브라우저로 정규화해 고정 기대값과 비교한다.

[4321 개발 서버 확인](site-shadcn/dev.json)도 통과했다. 홈의 테마 전환·페이지 간 유지, Accordion 실행, 개발 검색 안내, 모바일 문서 메뉴를 확인했으며 브라우저 오류가 없었다.

검증은 Chromium에서 실행했다. 라이브러리 패키지 소스는 이번 작업에서 변경하지 않아 이전 110개 브라우저 테스트를 반복하지 않았으며 사이트 통합에 영향을 받는 렌더링·동작을 다시 검사했다. 배포하지 않았다.
