# Viewstem 사이트 유지보수

[English](README.md) | 한국어

이 비공개 Astro 워크스페이스는 홈·문서·예제·플레이그라운드의 한국어·영어
사이트를 소유한다. 사이트를 수정할 때 이 문서부터 읽는다. 독자에게 제공하는
라이브러리 사용 문서는 [src/content/docs](src/content/docs)에 있으며, 이 안내는
사이트 자체를 유지보수하는 기여자를 위한 것이다.

사이트 동작은 아래 계약을 따릅니다. 미리보기와 운영 배포는 [릴리스 안내](../../docs/releasing.md#deploy-the-site)에서 관리합니다.

## 로컬 실행

Node.js 22.23.4 이상의 22.x 계열 또는 24 이상을 사용한다. 저장소 루트에서 실행한다.

```sh
npm ci
npm run dev:docs
```

`predev`가 미리보기에 쓰는 라이브러리 패키지를 빌드한다. 포트가 사용 중이면
달라질 수 있으므로 Astro가 출력한 주소를 확인한다. 작업을 마치면 자신이 실행한
서버를 Ctrl+C로 종료한다.

```sh
npm run typecheck:docs
npm run build:docs
npm run preview -w @viewstem/docs -- --port 4323
```

`build:docs`는 라이브러리 의존성을 다시 빌드하고 검색 색인을 포함한
`apps/docs/dist`를 생성한다. `preview:docs`는 Wrangler로 이 결과물을 제공하며
다시 빌드하지 않는다. 검색·배포용 경로 검사는 최신 빌드에서 수행한다.
[wrangler.jsonc](wrangler.jsonc)는 Workers Static Assets 설정이다. `dist`나
`.astro` 결과물을 직접 수정하거나 커밋하지 않는다.

## 사이트 동작 계약

공개 문서 사이트는 **Astro와 Starlight**로 구축한다. Starlight가 영·한 문서 탐색과 검색을 맡고, 같은 사이트의 `/playground/`에서 Svelte로 만든 편집·실행 화면을 제공한다. [D106](../../docs/decisions.md#a-현재-채택한-결정)

공개 문서의 좌측 메뉴는 시작하기, 핵심 개념, 가이드, 레퍼런스 안내, DSL 레퍼런스, @viewstem/core, @viewstem/dom, @viewstem/ui, @viewstem/svelte로 구성한다. 핵심 개념은 View와 Component, 값과 입력, State, 계산된 값, 이벤트와 Action, Query와 데이터, 조건과 목록, Component 재사용, 리소스와 타입의 9개 페이지로 구성한다. 각 페이지에서 정의·최소 코드·예상 결과·주요 실행 의미를 설명하고 대표 실습을 연결한다. 읽기 순서는 좌측 메뉴와 하단 이전·다음 탐색으로 제공하며, 개념 설명을 예제 링크 목록으로 대체하지 않는다. [조사와 페이지별 구성](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/docs-core-concepts-2026-11-05.md), [D110](../../docs/decisions.md#a-현재-채택한-결정)을 따른다. 문서 본문의 제목에서 페이지 목차를 만들고, 정적 빌드에서 Pagefind 검색 색인을 생성한다. [D108](../../docs/decisions.md#a-현재-채택한-결정)

패키지 문서는 개요 → 작업별 사용 가이드 → 상세 API 레퍼런스 순서로 구성한다. 공개 export·타입·구현을 기준으로 시그니처, 옵션·기본값, 반환값, 오류와 수명을 한국어·영어로 제공한다. DSL은 리소스와 표현식의 필드 계약을 별도로 설명한다. `@viewstem/ui`는 한·영 개요, 브라우저 마운트 가이드, API와 66개 계열 상세 페이지를 제공한다. 입력·슬롯·이벤트 표는 UI 패키지의 지원 메타데이터에서 생성한다. [D144](../../docs/decisions.md#a-현재-채택한-결정)

공개 문서의 상세 API 페이지는 상위 경로와 현재 메뉴 위치를 표시한다. UI의 지원 계열 66개를 좌측 컴포넌트 메뉴에 모두 나열하고, 현재 항목 표시·같은 언어의 인접 계열 이동을 제공한다. 각 계열 상세 페이지에는 실제 공개 렌더러로 실행되는 미리보기와 동일한 View JSON, 앱 등록 예제를 함께 제공한다. [D122](../../docs/decisions.md#a-현재-채택한-결정)를 따른다. 제목 크기는 h1 → h2 → h3 → h4 순서를 유지하고, 참조 표보다 목적·사용 예제를 먼저 설명한다. 일반 HTML·SVG 입력과 큰 중첩 타입은 펼침 영역으로 분리하되 지원 계약을 생략하지 않는다. 공통 헤더의 테마 선택은 밝게·어둡게·시스템 설정을 지원하며 모든 사이트 진입점에서 같은 선택을 적용한다. [D117](../../docs/decisions.md#a-현재-채택한-결정), [사이트 리뷰](review/2026-11-05/review.md)를 따른다.

`@viewstem/ui`의 계열 상세 페이지는 컴포넌트 이름과 역할 설명에 이어 기본 예제, 사용법, 추가 예제, JSON 레퍼런스 순서로 제공한다. 목차는 본문 순서를 따른다. 사용법에 기본 예제의 View JSON과 짝을 이루는 실행 코드를 바로 표시하고 코드 블록 헤더에서 복사할 수 있게 한다. 추가 예제는 미리보기·JSON·실행 코드 탭에서 조작·확인·복사한다. 참조 표의 제약은 해당 타입 아래에 표시한다. 미리보기는 Vega·Neutral 스타일로 실행한다. [D142·D146·D147](../../docs/decisions.md#a-현재-채택한-결정), [공식 예제 조사](review/2026-11-11/shadcn-example-comparison.md)를 따른다.

설명할 차이가 있는 변형은 기본 예제 아래에 별도 제목으로 제공하고 목차에서 바로 연결한다. 66개 계열의 한·영 상세 문서에 기본 예제에서 다루지 않는 입력·상태·조합을 보여 준다. 같은 입력의 차이는 비교 묶음으로, 구조나 조작이 달라지는 경우는 독립 예제로 제공한다. 각 묶음은 하나의 View JSON으로 실행·표시·복사하며, 하단 미리보기는 화면에 들어올 때 실행한다. [D143·D145](../../docs/decisions.md#a-현재-채택한-결정), [검토 결과](review/2026-11-11/component-example-variants/concepts_brief.md#goldfish-검토-종합)를 따른다.

`shadcn.Slider`의 다중 모드는 `value` 배열의 숫자마다 손잡이를 렌더링한다. 손잡이는 오름차순을 유지하고 `thumbLabels`로 각각 이름을 붙일 수 있다. `valueChange`와 `valueCommit`은 다중 모드에서 전체 배열을, 단일 모드에서 숫자를 전달한다. [D148](../../docs/decisions.md#a-현재-채택한-결정)을 따른다.

사이트 자체의 기본 UI는 공식 Astro 설치 방식의 shadcn-svelte로 통일한다. 공식 CLI가 생성한 원본 부품을 사용하고 React 런타임·통합·관련 의존성은 포함하지 않는다. `apps/docs/src/components/ui`의 사이트용 컴포넌트와 Neutral 테마를 사용하고, 헤더·검색·사이드바·목차·메뉴·페이지 탐색·예제 파일 탭·Playground 조작부를 포함한다. 문서·Examples·Playground에서 선언형 JSON을 실행하는 영역은 `@viewstem/ui`를 사용한다. CodeMirror 편집기와 문서 본문은 각각 편집·읽기 역할을 유지하며 사이트 테마 토큰을 따른다. D127의 React 구현 선택을 대체하며 기존 디자인·한영·모바일·테마·사이드바 스크롤 및 D142 예제 탭의 동작은 유지한다. [D130](../../docs/decisions.md#a-현재-채택한-결정), [적용 범위·검증](review/2026-11-06/site-svelte.md)을 따른다.

미리보기·JSON 탭은 같은 예제를 표시한다. 탭을 전환해도 실행 상태는 보존되고, 다시 실행하면 초기 상태로 돌아간다. JSON 탭과 복사 버튼은 초기 선언을 사용한다. JavaScript 없이도 초기 JSON과 앱 연결 코드를 읽을 수 있다. [D142](../../docs/decisions.md#a-현재-채택한-결정)를 따른다.


홈·예제·Playground·문서는 동일한 공통 헤더를 사용한다. 로고, 문서·예제·Playground 탐색, GitHub, 현재 페이지를 유지하는 언어 전환을 공유하고 문서에만 검색과 모바일 문서 메뉴를 추가한다. 모바일에서는 공통 탐색 아래에 문서 도구 행을 둔다. [D111](../../docs/decisions.md#a-현재-채택한-결정)

사이트 전체의 한글·영문 제목·본문·UI는 Pretendard, 코드와 편집기는 D2Coding을 사용하며 코드 합자는 끈다. 기본 서체에 없는 기호는 Noto Sans Symbols 2로 보완하고 이모지는 운영체제 컬러 이모지, UI 아이콘은 SVG를 사용한다. 웹폰트와 라이선스는 사이트에 포함하며 이 선택은 라이브러리 소비자의 폰트를 강제하지 않는다. 페이지 제목·공통 메뉴에 필요한 Pretendard 부분 파일과 기본 코드 폰트를 미리 요청하고, 본문·코드 폰트가 늦게 도착하면 현재 화면에서 대체 폰트를 유지해 읽는 중 위치가 바뀌지 않게 한다. 보조 기호 폰트는 시스템 문자 폰트 뒤에서 누락 기호를 보완한다. [D118](../../docs/decisions.md#a-현재-채택한-결정) [D112](../../docs/decisions.md#a-현재-채택한-결정)

사이트의 설명과 탐색에는 장식용 뱃지·반복 카드를 사용하지 않고 제목, 여백, 필요한 구분선으로 위계를 표현한다. 홈의 실행 흐름은 순서 목록, 특징은 열린 단락, 예제 진입은 텍스트 링크 목록으로 구성한다. 문서의 이전·다음 탐색은 구분선 아래 방향별 링크로 제공한다. 실행 화면·코드·팝오버의 기능적 경계와 라이브러리 사용법을 보여 주는 예제의 Card·Badge는 유지한다. [D113](../../docs/decisions.md#a-현재-채택한-결정)

DSL 리소스 7종의 JSON Schema는 각 리소스 문서에서 펼쳐 읽거나 단독 파일로 내려받는다. 화면과 파일은 [같은 정의](src/lib/resource-schemas.mjs)에서 빌드한다. 스키마는 JSON 구조를 검사하고, 등록된 참조와 표현식의 결과는 Core에서 검사한다. DSL 필드를 바꿀 때 스키마를 같이 갱신하고 `verify-dsl-docs.mjs`와 `verify-site-previews.mjs`를 실행한다. [D175](../../docs/decisions.md#a-현재-채택한-결정)

사이트 모션은 상태 변화와 탐색 방향을 이해하도록 보조한다. 홈의 일부 주요 영역에 한 번만 진입 효과를 적용하고 필터 변경, 실행 결과 교체, 메뉴·검색 열림, 앵커 목적지에 짧은 피드백을 제공한다. 상태 변경·입력·탐색은 애니메이션 완료를 기다리지 않으며, 본문을 기본적으로 숨기거나 모든 문단에 반복 진입 효과를 적용하지 않는다. `prefers-reduced-motion`에서는 모션을 생략하고 실행 중인 자체 모션도 취소한다. [D114](../../docs/decisions.md#a-현재-채택한-결정)

문서와 예제의 이전·다음은 같은 방향별 탐색 표현을 사용하며 모바일 예제는 실행 결과 아래에서 다음 실습으로 이어진다. 모바일 예제 목록은 본문에서 한 번만 제공한다. Playground는 빈 상태의 첫 예제·시작 문서 연결, 수동 실행 안내와 미실행 변경 표시, 같은 탭의 언어 전환에도 보존되는 초안을 제공한다. 복원한 초안은 자동 실행하지 않는다. 한국어 문서 검색·코드 복사 UI도 한국어로 제공한다. [D115](../../docs/decisions.md#a-현재-채택한-결정), [검토·검증](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/docs-site-consistency-2026-11-05.md)을 따른다.

시작하기의 문서 순서는 개요, 설치, 빠른 시작이다. 개요와 빠른 시작에서 브라우저 예제로 갈 수 있다. 설치에서 패키지 준비를 다루고, 빠른 시작에서는 브라우저에서 `@viewstem/ui`로 첫 View를 실행한다. [D109](../../docs/decisions.md#a-현재-채택한-결정)

공개 Playground는 하나로 제공한다. 브라우저에서 `@viewstem/ui`로 View JSON을 실행하고, 편집한 내용은 사용자가 실행할 때 적용한다. [D144](../../docs/decisions.md#a-현재-채택한-결정)

공개 홈은 제품 소개, 고객 목록 실행 흐름, 주요 특징, 브라우저 UI 연동, 폼·대시보드 가이드, 문서 진입 순으로 구성한다. 주 버튼은 첫 View를 실행하는 Quickstart로 연결한다. [D107](../../docs/decisions.md#a-현재-채택한-결정)

## 사이트 배포

PR 미리보기와 운영 배포는 [릴리스 안내](../../docs/releasing.md#deploy-the-site)를 따릅니다.

<a id="패키지-릴리스와-별도로-문서-배포"></a>
<a id="패키지-릴리스-및-운영-설정"></a>

## 수정 위치 찾기

영어 경로에는 언어 접두사가 없고 한국어는 `/ko`를 사용한다. 한영
[페이지 진입점](src/pages)은 공유 컴포넌트에 언어와 경로 데이터를 전달한다.
번역 때문에 페이지 구현을 별도로 복제하지 않는다.

| 영역 | 수정할 원본 |
| --- | --- |
| 홈 `/`, `/ko/` | [HomePage.astro](src/components/HomePage.astro), [home-content.ts](src/components/home-content.ts) |
| 문서 `/docs/`, `/ko/docs/` | [본문](src/content/docs), [Astro/Starlight 설정](astro.config.mjs), [콘텐츠 스키마](src/content.config.ts), [경로 미들웨어](src/lib/docs-route.ts) |
| 예제 목록·실습 | [ExamplesPage.astro](src/components/ExamplesPage.astro), 순서·문구는 [catalog.ts](src/examples/catalog.ts), 실행 JSON은 [definitions.ts](src/examples/definitions.ts), 편집·실행은 [preview.ts](src/examples/preview.ts) |
| 플레이그라운드 | [PlaygroundPage.astro](src/components/PlaygroundPage.astro), [Playground.svelte](src/components/Playground.svelte), [playground-copy.ts](src/components/playground-copy.ts), [playground-renderer.ts](src/components/playground-renderer.ts) |
| 공통 메타데이터·헤더·테마 | [SiteHead.astro](src/components/SiteHead.astro), [SiteHeader.astro](src/components/SiteHeader.astro), [ThemeInit.astro](src/components/ThemeInit.astro), [ThemeMenu.svelte](src/components/site/ThemeMenu.svelte); Starlight 연결부는 [components/docs](src/components/docs) |
| 공통 사이드바 | [SidebarNavigation.svelte](src/components/site/SidebarNavigation.svelte), [SidebarTree.svelte](src/components/site/SidebarTree.svelte), [SidebarSheet.svelte](src/components/site/SidebarSheet.svelte); 데이터 연결부는 [sidebar-navigation.ts](src/lib/sidebar-navigation.ts), [navigation.ts](src/examples/navigation.ts) |
| 문서 사이드바 상태 복원 | [docs-sidebar.ts](src/lib/docs-sidebar.ts), [docs-sidebar-bootstrap.js](src/lib/docs-sidebar-bootstrap.js), [Sidebar.astro](src/components/docs/Sidebar.astro) |
| 검색·페이지 탐색·내부 스크롤 | [Search.svelte](src/components/docs/Search.svelte), [Pagination.svelte](src/components/site/Pagination.svelte), [ScrollRegion.svelte](src/components/site/ScrollRegion.svelte), [ScrollEnhancements.astro](src/components/site/ScrollEnhancements.astro) |
| JSON 편집 | [json-editor.ts](src/lib/json-editor.ts)가 공통 CodeMirror 편집기를 설정한다 |

문서와 예제는 같은 사이드바 트리와 모바일 시트를 재사용한다. 연결부는 데이터·문구·
상태 복원 훅을 제공한다. 페이지나 화면 크기별로 트리를 재구성하지 말고 공유 구현을
수정한다. 사이트 조작부와 내부 ScrollArea 래퍼도 재사용한다. CodeMirror는 편집기
자체의 스크롤 동작을 유지한다.

## 디자인 일관성을 유지하며 수정하기

타이포·간격·너비·CSS 상속을 바꾸기 전에 [스타일 소유권](src/styles/README.md)을
읽는다. 공통 `site.css` 진입점, cascade 순서, 토큰과 페이지별 책임은 그 문서가
설명한다. 폰트 로딩·부분 파일·대체 서체를 바꾸기 전에는
[폰트 소유권](public/fonts/README.md)을 읽는다. 페이지 스타일은 해당 레이아웃을
소유하며 또 하나의 사이트 전체 reset이 되어서는 안 된다.

두 UI 원본의 역할을 구분한다.

- **사이트 조작부:** [components/ui](src/components/ui)의 공식 shadcn-svelte
  원본을 site/docs 컴포넌트에서 조합한다. 출처·해시는
  [사이트 upstream 기록](upstream/README.md)이 소유한다. 원본과 라이선스를
  보존하며, 임의로 디자인을 바꾼 vendor 파일의 해시를 승인하는 식으로 검사를 통과시키지 않는다.
- **JSON 실행 예제:** UI 레퍼런스·예제·Playground는 `@viewstem/ui`로 렌더링한다.

디자인 변경 시 홈·문서·예제 목록·예제 실습·플레이그라운드를 같은 언어·테마·화면
크기에서 비교한다. 한영, 밝고 어두운 테마, 좁고 넓은 화면을 확인한다. 키보드 포커스,
모바일 시트, 모션 감소, 내부 스크롤, 사이드바 탐색을 조작한다. 진입 시 불필요한
자동 포커스를 없애기 위해 포커스 테두리 자체를 숨기지 않는다.

## 콘텐츠와 예제 변경

### 직접 작성하는 문서

`src/content/docs/docs`와 `src/content/docs/ko/docs`의 대응 파일을 함께 수정한다.
언어 접두사 뒤 경로, 예제, 공개 이름, 지원 한계를 맞추고 제목 변경 시 기존 앵커를
보존한다. 명시적 메뉴 순서·그룹 번역·자동 생성 그룹·리다이렉트는
[astro.config.mjs](astro.config.mjs)가 소유한다. 페이지 제목·설명·자동 생성 그룹
안의 순서는 frontmatter가 소유한다. 경로 변경 시 한영 파일, 유입 링크와 필요한
리다이렉트를 함께 갱신한다. 새 URL뿐 아니라 언어 전환과 이전·다음 탐색도 확인한다.

### 생성되는 컴포넌트 레퍼런스와 실행 미리보기

`Generated by apps/docs/scripts/generate-ui-reference.mjs` 표시가 있는 파일은
생성물이다. [생성기](scripts/generate-ui-reference.mjs)의 한영 설명 또는 원본
패키지 계약을 수정한 뒤 저장소 루트에서 다시 생성한다.

```sh
npm run build:ui
node apps/docs/scripts/generate-ui-reference.mjs
node apps/docs/scripts/generate-ui-reference.mjs --check
```

생성기는 `packages/ui/dist/support.json`에서 한·영 66개 상세 페이지를 생성한다. 생성 전에 `npm run build:ui`를 실행하고, 표를 바꿀 때는 패키지 계약과 생성기를 수정한다.

[MarkdownContent.astro](src/components/docs/MarkdownContent.astro)가 각 컴포넌트
경로에 [ComponentDemo.astro](src/components/ComponentDemo.astro)를 삽입한다.
기본 예제와 변형의 구성·번역은 [component-reference-demos.mjs](src/examples/component-reference-demos.mjs)에서 관리한다.
화면에 표시·복사·실행하는 JSON은 같은 초기 선언을 사용한다.

[DemoWorkbench.svelte](src/components/DemoWorkbench.svelte)는 탭과 조작부를,
[component-demo-ui-runtime.ts](src/examples/component-demo-ui-runtime.ts)는 `ui` 셋을 등록하고
Core View를 `@viewstem/dom`으로 연결한다. Sonner의 호스트 Action은 별도 DOM Notifications View에 연결한다.
[component-demo-ui-setup.ts](src/examples/component-demo-ui-setup.ts)는 복사 가능한 앱 연결 코드를 생성한다.
탭 전환 시 상태를 유지하고 다시 실행하면 초기 상태로 돌아간다.

### 실습과 플레이그라운드

실습 정의, 한영 catalog 항목, [solutions.ts](src/examples/solutions.ts)의 실행 가능한 변경을
함께 수정한다. 실행 결과 도구 막대에서 변경된 JSON과 결과를 열고, 돌아오면 사용자의
편집 내용과 실행 화면을 복원한다. 변경 전후 결과, 필요한 resources/inputs, 초기화와 인접 실습을
확인한다. fixture와 실제 호스트 API를 구분한다. 플레이그라운드는 수동 실행,
미실행 변경 표시, 같은 탭에서 언어를 전환할 때 초안 복원을 보존한다. 복원한 초안을
자동으로 실행하지 않는다.

## 변경 영역에 맞는 검증 선택

아래 명령은 저장소 루트에서 실행한다. 매번 모든 스크립트를 실행하라는 의미가
아니며, 변경 영역에 맞게 선택한다. 기존 증거는 코드·입력·빌드·환경이 여전히
유효할 때만 재사용한다. 브라우저 스크립트는 Playwright를 사용한다. 필요하면
`npx playwright install chromium`으로 Chromium을 설치한다. 폰트·탐색,
공통 사이드바·상속·스크롤·검색 스크립트에는 설치된 Google Chrome을 실행하는 검사도 있다.

| 변경 | 기존 검증 |
| --- | --- |
| 유지보수 Markdown만 변경 | 로컬 링크와 명령을 원본에 대조하고 `git diff --check`. 사이트 빌드는 불필요하다. |
| 사이트 경로·콘텐츠·메뉴 | 최신 `npm run build:docs` 후 `node apps/docs/scripts/verify-docs-site.mjs`; Starlight 언어 처리 변경 시 `node apps/docs/scripts/verify-starlight-i18n.mjs` |
| Astro/Svelte/TypeScript | `npm run typecheck:docs`; `node apps/docs/scripts/verify-site-svelte.mjs`는 사이트 원본·React 제외·빌드된 island를 검사한다 |
| Core·DSL·UI 사용 코드 또는 작업 가이드 | 각각 `node apps/docs/scripts/verify-core-docs.mjs`, `node apps/docs/scripts/verify-dsl-docs.mjs`, `node apps/docs/scripts/verify-ui-docs.mjs`, `node apps/docs/scripts/verify-task-guides.mjs` |
| 컴포넌트 레퍼런스·설정 코드 | 생성기 `--check`; `node apps/docs/scripts/verify-component-setup.mjs` |
| 컴포넌트 예제와 탭 | `node --test apps/docs/scripts/component-demo-session.test.mjs`; `node apps/docs/scripts/verify-component-demos.mjs` |
| Examples와 Playground | `node apps/docs/scripts/verify-site-previews.mjs` (완성된 정적 서버의 `DOCS_ORIGIN`) |
| 사이드바 복원·ScrollArea | `node apps/docs/scripts/verify-sidebar-scroll.mjs`; `node apps/docs/scripts/verify-sidebar-scrollarea.mjs`; 공통 구성·텍스트는 아래 실행 서버 검사 |

코드 예제·설정 검사는 빌드된 라이브러리 export를 사용하므로 패키지를 수정했다면
`npm run build:ui`를 먼저 실행한다. 링크·사이트 원본·컴포넌트 설정·사이드바·컴포넌트 예제·
스타일 일치 검사는 `apps/docs/dist`를 읽으므로 관련 변경 후 사이트를 다시 빌드한다.
사이드바·컴포넌트 예제·스타일 일치 검사는 자체 정적 서버를 띄운다.

실행 중인 서버를 검사할 때는 주소를 명시한다. 스크립트마다 기본 포트가 4321과
4323으로 다르다. 예를 들어 빌드 미리보기 서버를 실행한 상태에서 다음을 사용한다.

```sh
DOCS_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-inheritance.mjs
SITE_UI_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-ui.mjs
DOCS_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-search.mjs
```

`scripts/`의 `verify-site-shell.mjs`, `verify-shared-sidebar.mjs`,
`verify-sidebar-text.mjs`, `verify-font-loading.mjs`, `verify-font-navigation.mjs`,
`verify-scroll-regions.mjs`, `verify-scroll-overlays.mjs`도 `DOCS_ORIGIN`을 사용한다.
전체 미리보기 디자인 감사에는 기존 실행기를 사용한다.

```sh
node apps/docs/scripts/verify-preview-design.mjs --origin=http://127.0.0.1:4323 --phase=matrix --output=/tmp/viewstem-preview-review
DEMO_INTERACTIONS_ONLY=1 node apps/docs/scripts/verify-component-demos.mjs
```

렌더링·상호작용 증거를 수집하는 명령이며 시각 검토를 대체하지 않는다.
`--family=<slug>`로 특정 계열만 검사할 수도 있다. 표본 검사와 전체 목록 감사를
구분한다. 임시 스크린샷·DOM 캡처는 소스 트리 밖에 둔다. 과거 발견 사항과 한계는
날짜가 있는 [리뷰 기록](review)을 참고한다. 실제 실행한 명령·범위·실패·미검증 영역을
보고하며 과거 결과를 새 통과 기록으로 바꾸지 않는다.
