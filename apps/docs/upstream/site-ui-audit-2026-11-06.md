# 사이트 UI 공식 컴포넌트 적용 검토 — 2026-11-06

## 범위와 기준

홈·문서·예제·플레이그라운드의 비벤더 Astro/Svelte 컴포넌트 **41개 전부**와 연결된 스타일·문서 본문 생성기를 검토했다. 아래 표는 각 파일의 처리 결과다. 한영은 같은 UI 소스를 사용한다.

공식 shadcn-svelte nova 소스를 CLI로 추가하고 원본을 수정하지 않았다. 28개 패밀리/158개 파일의 해시를 manifest로 보존한다. 라이브러리 공개 API/JSON preview는 변경하지 않았다.

## 파일별 결과

| 파일 (`src/components/` 기준) | 처리 |
| --- | --- |
| `ComponentDemo.astro` | DemoWorkbench + ScrollArea. setup details는 무스크립트 코드 열람 및 기존 검증 계약 유지. |
| `DemoOptions.svelte` | Field·Checkbox·Input·NativeSelect·Collapsible·Button 기존 공식 조합 유지. |
| `DemoWorkbench.svelte` | Tabs·Button 기존 조합 유지; reset/copy의 브라우저 title을 공식 Tooltip으로 교체. |
| `ExamplePreview.astro` | Button·Tabs·ScrollArea + 오류 Alert, 로딩 Spinner. 숨긴 textarea는 편집기 데이터 전달용. |
| `ExamplesPage.astro` | Button·SidebarNavigation·Breadcrumb·Pagination 조합. 설명용 details는 무스크립트 펼침 유지. |
| `FontPreload.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `HomePage.astro` | Button CTA, HomeCustomerTable 조합. 소개 문장·목록·코드 블록은 콘텐츠로 유지. |
| `PagePagination.astro` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `Playground.svelte` | Resizable·Button·Alert·ScrollArea 유지; Empty 및 실행 중 Spinner 추가. |
| `PlaygroundPage.astro` | 공통 헤더/메타/Playground를 배치하는 페이지 구조 유지. |
| `SiteHead.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `SiteHeader.astro` | 공식 Button·ThemeMenu·MobileNavigation. 현재 flat navigation에 불필요한 dropdown NavigationMenu는 추가하지 않음. |
| `ThemeControl.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `ThemeInit.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `docs/Empty.astro` | 사용하지 않는 Starlight 슬롯을 비우는 어댑터. 사용자-facing 빈 상태가 아니므로 Empty UI 추가하지 않음. |
| `docs/Head.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `docs/Header.astro` | 공통 메타·폰트·테마 초기화 또는 기존 공식 ThemeMenu 어댑터. 대체할 UI primitive 없음. |
| `docs/MarkdownContent.astro` | 본문 슬롯/스타일 경계; 컴포넌트 미리보기는 라이브러리 런타임 유지. |
| `docs/MobileDocsMenu.svelte` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `docs/MobileTableOfContents.astro` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `docs/PageTitle.astro` | Breadcrumb + 문서 제목/앵커 탐색. 본문 details 조상 자동 펼침 유지. |
| `docs/Pagination.astro` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `docs/Search.svelte` | 직접 목록/단축키 → Command·LinkItem·Kbd. Dialog, ScrollArea, Empty, Alert, Spinner 조합. Pagefind 검색·순위·언어·IME·더 보기 유지. |
| `docs/Sidebar.astro` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `docs/SidebarNavigation.svelte` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `docs/SiteToc.svelte` | 공식 DropdownMenu·Button·ScrollArea 유지; 문서 본문 앵커는 링크로 유지. |
| `docs/TableOfContents.astro` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `site/Breadcrumb.svelte` | 공식 Breadcrumb 유지. |
| `site/Button.svelte` | 공식 Button의 얇은 Astro 호환 어댑터 유지. |
| `site/ExampleFileTabs.svelte` | 공식 Tabs 유지. |
| `site/ExampleMenu.svelte` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `site/HomeCustomerTable.svelte` | 수동 aria-pressed 버튼 → 공식 ToggleGroup. 공식 Table.Head 행 헤더. 상태 텍스트는 배지 아닌 본문으로 유지. |
| `site/MobileNavigation.svelte` | 공통 공식 UI의 데이터/라우트/배치 어댑터. 별도 기본 UI 구현 없음; 기존 공유 컴포넌트 유지. |
| `site/Pagination.svelte` | 공식 Pagination 유지. |
| `site/ScrollEnhancements.astro` | 본문 코드·표 스크롤을 공통 ScrollArea로 연결하는 초기화 유지. |
| `site/ScrollRegion.svelte` | 공식 ScrollArea + viewport 치수/접근성 어댑터 유지. |
| `site/SidebarNavigation.svelte` | ScrollArea + 공통 SidebarTree. docs/examples/mobile 동일 구현. |
| `site/SidebarSheet.svelte` | Sheet + SidebarNavigation. 공식 Sidebar 프레임으로 재작성할 경우 별도 provider/mobile 상태와 현재 Starlight 프레임이 중복되므로 기존 공식 조합 유지. |
| `site/SidebarTree.svelte` | Button·Collapsible 유지; entry.badge → Badge. 저장된 그룹/현재 경로/forceMount 계약 유지. |
| `site/StaticScrollRegion.svelte` | 정적 HTML을 공식 ScrollArea에 이식하는 어댑터 유지. |
| `site/ThemeMenu.svelte` | 공식 DropdownMenu·Button·Tooltip 유지. |

## 의도적으로 남긴 표현

- 본문/설치 코드의 native `details`: JavaScript 없이 펼쳐 읽기, 해시 위치 자동 펼침을 보존한다. Collapsible은 조작 UI에서 이미 사용한다.
- Expressive Code의 코드·복사 버튼: 문서 렌더러의 읽기/언어/복사 기능으로 유지한다. 코드 편집은 CodeMirror가 담당한다. shadcn Code Block은 이 편집/문서 변환 계약의 대체품이 아니다.
- 본문 링크·목록·표·상태 문구·페이지 레이아웃: 카드나 배지로 감싸는 것은 컴포넌트 재사용 이익 없이 시각적 요소만 늘린다. 버튼 역할의 홈 CTA만 Button으로 교체했다.
- Sidebar는 기존 Button/Collapsible/Sheet/ScrollArea 조합을 공유한다. 라이브러리 이름이 Sidebar라고 전체 프레임을 바꾸지 않는다. 현재 페이지·스크롤·무스크립트 링크·세션 복원을 보존한다.

## 공식 근거

- [Kbd](https://shadcn-svelte.com/docs/components/kbd), [Command](https://shadcn-svelte.com/docs/components/command), [Empty](https://shadcn-svelte.com/docs/components/empty)
- [Toggle Group](https://shadcn-svelte.com/docs/components/toggle-group), [Tooltip](https://shadcn-svelte.com/docs/components/tooltip), [Spinner](https://shadcn-svelte.com/docs/components/spinner)
- [Collapsible](https://shadcn-svelte.com/docs/components/collapsible), [Sidebar](https://shadcn-svelte.com/docs/components/sidebar)

## 검증

- `verify-site-search.mjs`: 한영 × 320/1440 × light/dark. 실제 색인 검색, 결과 없음, 더 보기, IME 중 stale 결과 숨김, 방향키/Enter, Ctrl/Meta+K, Escape/닫기 버튼 Enter, focus 복원.
- `verify-scroll-regions.mjs`: 74개 레이아웃/내부 스크롤/편집 실행 회귀.
- `verify-scroll-overlays.mjs`: 한영 데스크톱/모바일 검색 ScrollArea 및 옵션 JSON 이동·초기화.
- `verify-shared-sidebar.mjs`: 문서·예제·모바일의 공통 스타일/동작.
- `verify-site-svelte.mjs`: 공식 소스 해시, React 의존성/JSX 없음, Svelte 렌더러.
- `npm run typecheck -w @viewstem/docs`, 문서 사이트 빌드(331페이지).

최종 실행 결과/스크린샷은 로컬 `design-audit-20261106/shadcn-audit/`에 보존한다.
