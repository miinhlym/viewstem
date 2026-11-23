# Viewstem 사이트 유지보수

[English](README.md) | 한국어

이 비공개 Astro 워크스페이스는 홈·문서·예제·플레이그라운드의 한국어·영어
사이트를 소유한다. 사이트를 수정할 때 이 문서부터 읽는다. 독자에게 제공하는
라이브러리 사용 문서는 [src/content/docs](src/content/docs)에 있으며, 이 안내는
사이트 자체를 유지보수하는 기여자를 위한 것이다.

제품 결정의 기준은 [사이트 계약](../../docs/VIEWSTEM-SPEC.md#34-공개-문서와-playground-배포)과
[결정 이력](../../docs/history/decision-register.md)이다. 이 안내는 그 결정을
구현 위치와 검증에 연결한다. 라이브러리 명세를 대체하거나 과거 리뷰 결과를
현재의 보장으로 취급하지 않는다.

## 로컬 실행

지원 중인 Node.js 릴리스 계열의 22.12 이상을 사용한다. 저장소 루트에서 실행한다.

```sh
npm ci
npm run dev:docs
```

`predev`가 미리보기에 쓰는 라이브러리 패키지를 빌드한다. `npm ci`는 저장소의
[의존성 패치](../../patches)도 적용한다. `--ignore-scripts`로 설치했다면 타입
검사 전에 `npx patch-package --error-on-fail`을 실행한다. 포트가 사용 중이면
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

## 사이트 배포

[Docs preview 워크플로](../../.github/workflows/docs-preview.yml)는 이 저장소의
브랜치에서 `main`을 대상으로 연 PR의 head를 빌드한다. 전용 `viewstem-preview`
Worker에서 PR마다 `pr-<번호>`를 만들고
`https://pr-<번호>-viewstem-preview.miinhlym.workers.dev`로 제공한다. 공개 주소에서
이번 빌드가 확인되면 PR별 배포 이력을 남기고, 댓글 하나에 미리보기 링크와 커밋,
실행 링크를 갱신한다. PR을 닫거나 머지하거나 대상을 `main` 이외로 바꾸면 해당
프리뷰를 삭제하고 배포를 비활성으로 표시한 뒤 기존 댓글을 갱신한다. PR을 다시
열거나 대상을 `main`으로 되돌리면 미리보기를 다시 만든다. 포크 PR은 위의 로컬
미리보기 절차를 사용한다.

삭제에 실패하면 PR이 여전히 닫혀 있거나 대상이 `main` 이외인지 확인한 뒤 실패한
정리 잡을 재실행한다. PR을 닫을 때 기본 브랜치에 정리 워크플로가 없었다면 관리자가
저장소 루트에서 `npx --no-install wrangler preview delete --config apps/docs/wrangler.jsonc
--worker-name viewstem-preview --name pr-<번호>`로 해당 프리뷰를 삭제할 수 있다.

[운영 배포 워크플로](../../.github/workflows/docs-release.yml)는 패키지 릴리스와
문서 사이트 전용 PR에서 실행한다. 두 경로 모두 공개 npm 패키지로 빌드하고,
배포 전에 링크, 예제, Playground 동작을 검사한다.
[Astro의 `site` 설정](astro.config.mjs)이 사이트맵에 쓸 공개 주소를 지정한다.

### 현재 공개 버전의 문서 수정

문서 사이트 전용 PR이 squash merge되고 `main` CI가 통과하면 운영 배포를 검토한다.
대상 경로는 `apps/docs/src/`, `apps/docs/public/`, Astro 설정, `components.json`,
`tsconfig.json`이다. 스타일 CSS와 공개 이미지·폰트만 바뀌면 자동으로 반영한다.
설치 가이드, API 설명, 레이아웃, 예제, Playground 등 다른 사이트 변경은 현재 공개
패키지에서 쓸 수 있는지 리뷰하고, 머지 전에 PR에 `docs:publish` 라벨을 붙인다.
미출시 기능에 맞춰야 하는 변경에는 `docs:next-release`를 붙인다. 두 라벨이 함께
있으면 다음 릴리스까지 기다린다. 머지 후 라벨 변경은 배포 판정에 반영되지 않는다.
저장소에 두 라벨이 없다면 위 이름으로 생성한다.

패키지 소스·버전, changeset, 의존성 파일, 검증 스크립트, 배포 설정 또는 저장소 설계
문서까지 바뀐 PR은 이 경로에서 제외된다. 운영 기준이 이미 있어야 문서 전용 배포를
할 수 있으므로, 첫 `0.1.0` 배포는 아래 절차를 따른다.

| 상황 | 운영 배포 동작 |
| --- | --- |
| `main`에 미출시 패키지 코드나 그 설명이 쌓인 뒤 푸터만 수정 | 지금 서빙 중인 패키지 릴리스 소스에 공개 가능한 사이트 PR의 변경분만 순서대로 적용한다. |
| 변경분이 아직 공개하지 않은 파일이나 주변 내용에 의존 | 해당 PR을 보류하고 독립적으로 적용할 수 있는 다른 PR은 처리한다. Actions 로그에 보류된 PR이 표시된다. |
| 문서 갱신 뒤 먼저 머지된 패키지 릴리스의 배포 잡이 도착 | 새 릴리스 소스를 사용하고 그보다 늦게 머지되어 이미 공개한 문서 수정도 다시 적용한다. 이미 공개한 수정과 충돌하면 배포를 중단한다. |
| 예전 갱신 잡이 늦게 도착하거나 재실행됨 | 운영에 더 새로운 문서 범위가 있으면 건너뛴다. 같은 범위의 실패한 잡은 다시 실행할 수 있다. |
| 빌드·브라우저 검사 중 실패하거나 Cloudflare 버전이 바뀜 | 새 버전을 올리지 않는다. 배포 후 공개 검사 실패는 아래 버전 복구 절차를 따른다. |

### 패키지 릴리스 및 운영 설정

npm 릴리스는 배치 전체를 공개하고 태그를 만든 뒤 운영 워크플로를 호출한다.
다른 발행 워크플로도 `main`에서 같은 절차를 사용할 수 있다. 레지스트리 공개를
확인한 뒤 릴리스 커밋에 npm은 `@viewstem/<이름>@<버전>`, pub.dev는
`pub.dev/<이름>@<버전>` 태그를 만든다. 그 커밋을 `source_sha`로 넘기고,
`released_packages`에는 `registry`, `name`, `version`을 담은 JSON 배열로 배치의
모든 패키지를 넘긴다. 각 재사용 워크플로 호출에는
`CLOUDFLARE_PRODUCTION_API_TOKEN` 시크릿 이름을 명시하고, 값은
`docs-production` 환경에 둔다. 운영 워크플로는 공개 버전과 태그를 확인한다.
패키지 릴리스와 문서 전용 배포는 같은 운영 큐를 사용한다. Cloudflare 버전 태그와
공개 `/_viewstem-deploy.json`에 패키지 릴리스 소스와 처리한 문서 범위의 끝 커밋을 기록한다.
GitHub Deployments에는 업로드와 공개 사이트 검사가 성공한 운영 배포만 남는다.
기록 잡이 실패했다면 워크플로 전체를 다시 실행해 공개 사이트를 다시 확인한다.

두 워크플로는 `miinhlym.workers.dev`를 소유한 계정의 저장소 변수
`CLOUDFLARE_ACCOUNT_ID`를 사용한다. 처음 설정할 때 Cloudflare 관리자가
`viewstem`과 `viewstem-preview`를 먼저 생성한다. 첫 운영 배포 전에는 `viewstem`을
배포 이력이 없는 상태로 준비한다. 활성 Cloudflare 버전에는 소스 SHA 태그가 있어야
워크플로가 교체할 수 있다. 기존 단일 SHA 태그도 읽을 수 있다. 운영 Worker에는 `workers.dev` 경로를,
미리보기 Worker에는 Preview URL을 활성화한다. 토큰은 각각 아래 Worker로 제한한
**Individual Workers Editor** 권한으로 발급하고 대상 GitHub Actions 환경에 등록한다.

| 환경 | 시크릿 | Cloudflare Worker |
| --- | --- | --- |
| `docs-preview` | `CLOUDFLARE_PREVIEW_API_TOKEN` | `viewstem-preview` |
| `docs-production` | `CLOUDFLARE_PRODUCTION_API_TOKEN` | `viewstem` |

GitHub의 `docs-production` 환경 배포 브랜치 규칙은 `main`만 허용한다.

0.1.0 문서를 처음 공개하려면 GitHub Actions의 **Docs production release**에서
`main`을 선택하고 **Run workflow**를 실행한다. `bootstrap_0_1_0`을 켜고,
배포 설정을 포함하며 0.1.0의 패키지 소스가 그대로인 `main` 커밋의 전체 SHA를
입력한다. `released_packages`에는 공개된 Core, DOM, Svelte, UI의 npm 0.1.0
항목 네 개를 모두 넣는다. 버전이 계속 최신이면 같은 초기 배포 소스를 재시도할 수 있다.

일반 릴리스를 재시도할 때는 `bootstrap_0_1_0`을 끄고 릴리스 태그의 커밋과
같은 배치를 지정한다. 패키지 릴리스 경로는 요청 버전과 사이트가 사용하는 npm 버전이
각 레지스트리의 최신 버전이어야 한다. 문서 전용 배포는 운영 소스가 고정한 공개 npm
버전을 쓴다. 공개 검사에 실패하면 Actions 실행 요약에서 소스 SHA와
교체 전후의 Cloudflare 버전 ID를 확인한다. 이전 버전이 있으면 관리자가
`viewstem` Worker의 **Deployments**에서 복구하고, `/_viewstem-deploy.json`과
설치 문서에서 복구된 빌드를 확인한다. 다음 자동 배포는 복구된 버전에서 시작해
승인된 문서 PR을 다시 계산하므로, 문제가 있는 변경은 수정 PR로 바로잡는다.
[Cloudflare 롤백 절차](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

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

실습 정의와 한영 catalog 항목을 함께 수정한다. catalog가 경로와 학습 순서를
결정한다. 예상 결과, 변경해 볼 내용, 필요한 resources/inputs, 초기화와 인접 실습을
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
