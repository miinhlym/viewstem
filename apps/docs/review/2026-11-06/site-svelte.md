# 사이트 UI의 공식 shadcn-svelte 전환

2026-11-06. D130에 따라 홈·문서·예제·Playground의 사이트 UI를 공식 shadcn-svelte로 전환하고 React 관련 의존성을 제거했다. 기존 Neutral 테마·서체·레이아웃·한영 경로·상호작용은 유지한다.

## 구현 범위

[공식 Astro 설치](https://www.shadcn-svelte.com/docs/installation/astro)에 따라 `shadcn-svelte@1.8.0` CLI로 Nova/Neutral 부품을 설치했다. Button, Input, Checkbox, Native Select, Field, Label, Table, Tabs, Alert, Resizable, Dialog, Sheet, Collapsible, Dropdown Menu, Separator, Tooltip, Breadcrumb, Pagination의 18개 계열, 115개 소스 파일을 수정 없이 사용한다. 자체 유사 디자인으로 대체하지 않았다. [설치 출처·해시](../../upstream/site-ui-manifest.json), [라이선스·재현 방법](../../upstream/README.md).

| 사이트 조합 | 적용 범위 |
| --- | --- |
| Button, Breadcrumb, Pagination | Astro 호출부와 링크·페이지 탐색 |
| ThemeMenu, MobileNavigation | 공통 헤더, 시스템·밝음·어둠, 모바일 주 탐색 |
| HomeCustomerTable | 홈 상태 필터 예제의 표 |
| ExampleFileTabs, ExampleNavigation, ExampleMenu | 예제 목록·파일 탭·모바일 레슨 탐색 |
| SidebarNavigation, MobileDocsMenu, Search, SiteToc | 문서 사이드바·모바일 메뉴·Pagefind 검색·목차 |
| DemoWorkbench, DemoOptions | 미리보기·옵션·JSON, 상태 보존과 초기화, 입력 검증 |
| Playground | CodeMirror·실행·초기화·UI 세트 선택·크기 조절 |

위 16개 Svelte 조합과 Astro 래퍼를 적용했다. React/React DOM, Astro React 통합, React 타입, Radix React, Lucide React, React Resizable Panels, React shadcn CLI를 의존성 및 lockfile에서 제거했다. JSX/TSX 파일은 0개이며 빌드에서 발견한 2,143개 island는 Svelte 렌더러를 사용한다. [자동 검사](../../scripts/verify-site-svelte.mjs), [결과](site-svelte/provenance.json).

기존 데모 세션·미리보기 DOM·JSON 컨트롤러는 유지하며 컴포넌트 종료 때 이벤트와 세션을 정리한다. 사이드바는 SSR 직후 저장된 그룹의 높이와 스크롤을 먼저 복원하고 Svelte 마운트 완료 후 임시 CSS를 해제한다. Playground 키보드 크기 조절은 기존 5% 단위를 유지한다. Astro에서 데모 CSS를 직접 가져와 production의 동적 CSS preload 누락을 방지하고, Playground CSS 순서는 기존 제목 크기를 보존하도록 유지했다.

## 검증 결과

이전 React 빌드의 40개 조합과 화면을 기준선으로 저장했다. 변경 후 정적 production 빌드에서 검증했으며, 개발 서버는 빌드·타입 검사 종료 후 재시작했다. 모두 Chromium에서 실행했다.

| 검증 | 결과·증거 |
| --- | --- |
| 전체 workspace 타입 검사 | core·svelte·docs 통과. Astro 86파일 및 Svelte 진단 오류·경고 0. [로그](site-svelte/typecheck.txt) |
| 사이트 production 빌드 | 통과. [로그](site-svelte/build.txt) |
| 공통 UI 행렬 | 한영 × 밝음·어둠 × 320·1440px × 홈·문서·예제 목록·레슨·Playground = 40/40. 테마 전환, 모바일 메뉴, Escape·포커스 복귀, 파일 탭, 넘침 검사. [기준선](site-svelte/baseline.json), [결과](site-svelte/site-ui.json) |
| 옵션·JSON·미리보기 | 69개 검사 통과. 입력·IME·검증, 복사·재실행·기본값 복원, 런타임 DOM 유지, 지연 로딩·스트리밍·페이지 수명주기, 해시·반응형 포커스. [결과](site-svelte/options.json). 데모 세션 단위 검사 4개도 통과 |
| 전체 컴포넌트 문서 | 66계열 × 한영 = 132/132. JSON·메뉴·넘침 및 대표 동작 14개 통과. [결과](site-svelte/demos.json) |
| 원본 스타일 | 66계열 × 2테마 × 2너비 = 264/264. 같은 DOM에 고정 원본 Nova/Tailwind를 적용한 기준과 21개 속성 비교. [결과](site-svelte/library-styles.json) |
| 문서 메뉴·검색·목차 | 한영 데스크톱·터치 모바일 4조합. 66개 링크, Pagefind 섹션·더 보기·연속 입력, Cmd/Ctrl+K, Escape, 포커스 유지와 앵커. [상세](site-svelte/navigation.md) |
| 사이드바 스크롤 | 10개 검사 통과. 8개 한영·테마·너비 조합에서 350ms hydration 지연 중 모든 관찰 프레임이 저장 위치 유지. 새로고침·뒤로 가기·그룹 상태·저장소 차단·모바일 분리 확인. [결과](site-svelte/sidebar-scroll.json) |
| Playground | 한영·테마·너비 8조합, 터치·키보드 크기 조절, 실행·오류·복구·초기화·초안·언어·테마, 한영 no-JS 확인. [결과](site-svelte/playground.json) |
| 예제 탐색 | 한영 그룹 접기·펼치기, 모바일 레슨 Sheet 링크·Escape·포커스 복귀. [결과](site-svelte/examples-navigation.json) |
| 정적 페이지·설정 코드 | HTML 335개, 한영 쌍 123개, 컴포넌트 메뉴 246개, 링크 40,770개 오류 0. 렌더링된 setup.ts/view.json 132쌍 타입 검사 통과. [페이지](site-svelte/site-integrity.json), [설정](site-svelte/setup.txt) |
| 개발 서버 | 동일 공통 UI 행렬 40개 및 한영 홈 필터·사이드바 이동 확인. [행렬](site-svelte/dev.json), [추가 동작](site-svelte/dev-interactions.json) |

Svelte의 모듈 스크립트에서 내보내는 타입·variant를 올바르게 검사하도록 docs 타입 검사를 `astro check && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`로 구성했다. 일반 `tsc`의 `.svelte` 모듈 해석 실패를 타입 우회로 숨기지 않았다. 공식 Svelte autofixer와 독립 리뷰에서도 수정이 필요한 확정 결함을 찾지 못했다.

## 비교 범위와 한계

기준 화면과 변경 후 화면은 각각 [baseline](site-svelte/baseline/)과 [after](site-svelte/after/)에 보존했다. Playground의 모바일 본문 픽셀 차이는 0, 데스크톱은 0.216%였으며 주요 레이아웃 좌표는 일치했다. 기존 `font-display: optional` 정책으로 D2Coding 대신 Menlo가 사용되는 실행에서는 코드 글꼴·gutter 폭 차이가 관찰됐다. 이 전환에서 폰트 정책을 변경하지 않았다.

브라우저 검증은 Chromium 범위이며 Safari·Firefox는 별도 실행하지 않았다. React 원본 소스 스냅샷 대신 전환 전 실행 기록과 화면을 비교했다. Astro의 기존 markdown plugin deprecation 안내는 남아 있으나 타입 진단과 빌드 실패는 없다. 공개 배포는 수행하지 않았다.
