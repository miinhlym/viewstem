# 패키지 가이드와 공개 API 레퍼런스 — 2026-11-05

사용자 요청에 따라 기존 학습 문서를 유지하고 DSL, Core, Svelte, Svelte UI의 한국어·영어 문서를 사이트에 추가했다. 공개 배포나 커밋은 수행하지 않았다. 완료 기준은 실제 공개 API의 문서 연결, 언어별 페이지 대응, 실행 예제 검증, 사이트 빌드·링크·검색·모바일 탐색 확인이다.

## 공식 레퍼런스 조사와 적용

| 조사 대상 | 관찰한 구성과 표현 | Viewstem에 적용한 방식 |
|---|---|---|
| [TanStack Table API](https://tanstack.com/table/latest/docs/reference/index) | 시작하기, 가이드, API, 예제를 분리하고 Core와 프레임워크별 API를 구분한다. | 기존 핵심 개념·복합 가이드를 유지하고 Core, Svelte, Svelte UI를 별도 메뉴로 구성한다. |
| [TanStack Query QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient) | 생성·사용 예제 다음에 메서드별 시그니처, 인자, 옵션, 반환값을 조회할 수 있다. | API 페이지는 목적·import·시그니처·옵션과 기본값·반환값·오류·수명 순서로 작성한다. 객체별 메서드를 같은 페이지에서 찾게 한다. |
| [Svelte 문서](https://svelte.dev/docs/svelte/overview) | 문법·개념 설명과 모듈 API를 구분한다. | JSON DSL의 필드 계약을 패키지의 호스트 API와 분리한다. Svelte 어댑터 작성·마운트·수명 관리는 작업별 가이드로 제공한다. |
| [shadcn-svelte Button](https://www.shadcn-svelte.com/docs/components/button) | 컴포넌트별 설치·사용·변형 예제를 제공한다. | UI의 각 계열에 import·등록·JSON ID·입력·이벤트·슬롯·네이티브 사용 범위를 제공한다. upstream 기능을 Viewstem JSON 지원으로 간주하지 않고 현재 support.json을 기준으로 작성한다. |

공식 문서의 정보 구조를 참고했으며 본문과 예제는 Viewstem 공개 API에 맞게 작성했다. 외부 문구나 API를 복제하지 않았다. 링크 목록은 전체 목록·색인에서 사용하고, 개별 사용법 설명을 외부 링크로 대체하지 않았다. 본문에는 현재 작업과 직접 관련된 참고 링크만 둔다. 종전 `/docs/reference/#host-examples` 주소는 유지하면서 실제 패키지 가이드로 연결한다.

## 메뉴와 페이지별 범위

시작하기 → 핵심 개념 → 가이드 → 레퍼런스 안내 → DSL → Core → Svelte → Svelte UI 순서다. 각 그룹은 접을 수 있고 현재 문서가 속한 그룹은 열린다. UI 계열 66개는 전역 메뉴를 늘리지 않고 컴포넌트 세트 목록에서 찾아간다. 문서 검색은 상세 계열 페이지도 포함한다.

아래 경로는 `/docs/` 기준이며 한국어에는 `/ko` 접두사가 붙는다. 총 106개 페이지 쌍, 212개 신규 문서다.

| 구분 | 페이지 | 내용 |
|---|---|---|
| DSL, 9개 | `dsl/`, `resources`, `values`, `view-and-component`, `state-and-ports`, `queries`, `datasources`, `actions`, `types` | 외피·종류·참조, 값 표현식, 노드·슬롯·반복, State·Derived·포트, Query 소스·변환·사용 설정, HTTP 요청·인증, 단계와 결과, 스키마·Type 계약 |
| Core 개요·가이드, 4개 | `core/`, `guides/runtime`, `guides/state-and-url`, `guides/http-and-actions` | UI 없는 View 실행·관찰, State 공유·URL 복원, 모의 HTTP와 코드 Action 실행 |
| Core API, 9개 | `registry`, `runtime`, `view`, `state-store`, `url`, `http`, `cel`, `utilities`, `types` | 등록·스냅샷·호스트 수명, 관찰·갱신·교체, State·트랜잭션·반응, URL 어댑터, HTTP 실행 계획, CEL 함수·제한, Grid 배치, 전체 공개 이름 색인 |
| Svelte 개요·가이드, 4개 | `svelte/`, `guides/mount-in-svelte`, `guides/write-an-adapter`, `guides/manage-view-lifecycle` | 앱 마운트, 슬롯·이벤트가 있는 어댑터, 갱신·교체·폐기 |
| Svelte API, 6개 | `renderer`, `mounted-view`, `adapters`, `viewstem-view`, `errors`, `types` | createRenderer·옵션·메서드, 소유/차용 연결, 어댑터 Props, 선언형 연결 컴포넌트, 진단, 타입·Core 재노출 |
| UI 개요·가이드, 4개 | `svelte-ui/`, `guides/register-families`, `guides/compose-json`, `guides/style-and-native` | 필요한 계열 등록, 슬롯·Action 조합, 스타일과 네이티브 Svelte 사용 |
| UI 공통 API, 4개 | `registration`, `component-sets`, `support`, `attributes` | 등록 API, 전체 계열 목록, 지원 메타데이터·CSS, 중복 HTML·ARIA·DOM 이벤트 계약 |
| UI 계열별 API, 66개 | `components/<family>` | 실제 export, JSON 컴포넌트 ID, 입력 스키마·확인된 기본값, 이벤트 payload, 슬롯, 네이티브 전용 부품·별칭·헬퍼·타입 |

## 실제 공개 API 근거

- Core: `packages/core/src/index.d.ts`, `http.d.ts`, `cel.d.ts`의 공개 선언 83개, 진입점별 재노출을 포함한 88개 binding을 색인과 상세 페이지에 연결한다. `cel-support.json` 자산도 별도로 설명한다. 클래스처럼 보이는 타입 이름을 생성자로 안내하지 않는다.
- Svelte: 런타임 값 3개와 고유 타입 12개를 설명하고 Core 타입 재노출 70개는 Core 색인으로 연결한다.
- Svelte UI: package exports 70개, 66개 계열을 다룬다. upstream 부품 386개 중 351개와 JSON 조합 6개가 총 357개 JSON ID를 이룬다. 나머지 upstream 부품 35개는 네이티브 Svelte 문맥 전용으로 구분한다.
- UI 세부 표는 `support.json`, 실제 export, wrapper 소스에서 생성한다. 임의의 기본값은 추측하지 않는다. Calendar README의 실제 export 이름도 두 언어에서 `Calendar.Calendar`로 바로잡았다.

전체 이름·진입점·페이지 매핑과 문서 소스 SHA-256은 [검증 기록](docs-package-reference-verification-2026-11-05.json)에 보존한다.

## 검증 결과와 재실행

저장소 루트에서 실행한다.

```sh
node apps/docs/scripts/verify-core-docs.mjs
node apps/docs/scripts/verify-dsl-docs.mjs
node apps/docs/scripts/generate-ui-reference.mjs --check
node apps/docs/scripts/verify-ui-docs.mjs
npm --workspace @viewstem/docs run build
```

- Core: 문서에 있는 독립 실행 JavaScript 예제 14개가 실제 출력 검증을 통과했다.
- DSL: 양쪽 언어의 JSON 예제 16개를 공개 Core API로 실행했다. Core 회귀 테스트 1,080개도 통과했다.
- Svelte: 가이드 코드 블록 18개와 참조 import 2개로 구성한 앱 6개가 strict 타입 검사, Vite 빌드, Chromium 실행을 통과했다. Svelte MCP와 컴포넌트 검사도 통과했다.
- UI: TypeScript·Svelte 스니펫 150개가 오류·경고 없이 타입 검사를 통과했고 Chromium 동작 검증 20개가 통과했다. 계열 레퍼런스 재생성 일치 검사가 통과했다.
- Astro: 331개 페이지 빌드, 리다이렉트 등을 포함한 HTML 335개와 Pagefind 검색 색인 생성이 완료됐다.
- 전체 빌드 HTML의 내부 링크·앵커 27,922개가 통과했다. 404 페이지의 잘못된 한국어 전환 주소는 해당 언어 홈으로 연결하도록 수정했다.
- 브라우저: 320px와 1440px에서 Core·DSL·Svelte·UI의 대표 문서 20개씩 검사해 페이지 가로 넘침이 없었다. 코드·표 내부 스크롤은 허용한다. 한국어 `createHttpExecutor`, 영어 `createRenderer` 검색, 모바일 메뉴 열기·이동 후 닫힘, 같은 페이지 언어 전환을 확인했다. 모든 문서를 개별 시각 검토한 것은 아니다.

빌드에는 기존 remark 옵션 사용 중단 안내, 큰 클라이언트 청크 안내, `site` 미설정에 따른 sitemap 생략 경고가 남아 있다. HTTP 예제는 모의 전송을 사용하므로 실제 외부 서버·인증 연동 검증을 의미하지 않는다. 기존 전체 사이트 TypeScript 검사에는 Starlight 내부 `astroI18nConfig.routing` 관련 오류가 있으며, 이번 문서 예제 타입 검사 통과와 구분한다.

## 발견한 기존 명세·구현 차이

이번 작업은 문서 작성이며 아래 런타임 동작을 변경하지 않았다. 공개 사이트에는 확인된 현재 사용법을 기술하고, 기존 상위 설계를 조용히 바꾸지 않도록 차이를 기록한다.

1. `VIEWSTEM-SPEC.md`의 Action 단계 설명은 `inputs`를 명시하도록 서술하지만 `index.d.ts`의 Step, Registry 검증, Action 실행은 필수 입력이 남지 않을 때 생략을 허용한다. Query·Action·Variable 단계에서 inputs를 생략해 `[1, 2, 3]`을 반환하는 공개 API probe로 확인했다. 상위 설계 문구와 공개 타입의 정렬은 별도 결정 대상이다.
2. 새 Query use의 `refresh` 기본값은 true이고 `intervalMs` 생략은 주기 없음이다. 그러나 기존 use를 유지하는 `view.update`에서는 `query/usage.mjs`가 이전 설정과 병합하여 생략한 `refresh:false` 또는 `intervalMs:500`이 남는다. 삭제 후 수동 refresh 거절과 500ms 타이머 유지를 재현했다. DSL Query와 Core View 페이지에 현재 제한을 명시했다. 생략으로 기본값 복원을 안내하지 않는다.
3. 저수준 평가 경로에 Query 접근 기능이 있어도 공개 Registry는 State 초기값·Derived 입력에서 `/ports`, `/states`만 허용한다. 문서는 실제 공개 경계의 검증 결과를 따른다.

사이트 메뉴 계약은 [명세 3.4](../VIEWSTEM-SPEC.md#34-공개-문서와-playground-배포)와 D116에 반영했다.
