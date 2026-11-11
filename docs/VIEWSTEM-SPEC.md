# Viewstem 최종 설계 명세

현재 공개 API 이름과 변경 후 검증은 [U42 네이밍 적용](handoff/public-api-naming-2026-11-02.md), [검증 기록](handoff/public-api-naming-verification-results.json)을 따른다. U41 및 이전 기록의 API 이름·해시는 당시 증거로 보존한다.

최초 통합: **2026-10-28** · 현재 인계: **2026-11-02, U41** · 구현 담당자를 위한 현재 계약

설계 복원·명확화의 배경은 [결정 등록부](history/decision-register.md)와 [원문→계약 대응표](handoff/source-contract-matrix.md)에 있다. 현재 구현·검증 결과는 [제품 인수인계](handoff/core-implementation-2026-11-02.md), 실제 잔여는 [후속 작업](handoff/open-contracts.md#실제-남은-작업)을 따른다. 이 명세는 언어 독립 계약을 소유하며 진행 수치를 복제하지 않는다.

Viewstem은 **재사용 리소스로 UI·상태·데이터·동작을 선언하고, 사용자와 에이전트가 같은 실행 규칙으로 화면을 조작하는 도메인 독립 라이브러리**다. 에이전트 없이도 실행 가능하며, 에이전트는 별도 엔진이 아니라 같은 코어의 요청 주체다.

이 문서는 과거 대화를 읽지 않아도 현재 설계의 목적·리소스 경계·실행 의미를 이해할 수 있는 기준이다. 아래 주제별 파일도 이 명세의 일부다. 과거 제안·폐기안과 현재 명세가 충돌하면 **명시적으로 대체된 최신 결정**을 적용한다. 구현 편의를 위한 새로운 선택은 기존 결정으로 가장하지 않는다.

## 읽는 순서와 파일 지도

| 파일 | 내용 |
|---|---|
| 이 문서 | 목표, 7종 리소스, 공통 외피·참조, 상태·포트, 실행·수명, 보안, 확장, 에이전트 |
| [01 Datasource와 인증](spec/01-datasource-auth.md) | Http, 요청 병합, Login, 서버 평가 경계, 인증 7가지 JSON |
| [02 Query](spec/02-query.md) | sources/transform, 중첩 입력, join/concat, 소유 Query 인스턴스·refresh |
| [03 Variable·Type](spec/03-variable-type.md) | CEL, JSON Schema/typeRef, 타입 의미와 예시 |
| [04 Action](spec/04-action.md) | 단계, 인라인/참조, 결과·void, 코드 확장, 실행 관찰 |
| [05 Component·View](spec/05-component-view.md) | JSON 골격, slots/events/on, when/repeat, Grid |
| [06 연결 예시](spec/06-composition-examples.md) | State→입력→이벤트→Action→결과, 슬롯 작성자 문맥, 반복 Grid |
| [07 호스트 연결](spec/07-host-integration.md) | 구현 제안인 등록·마운트 의사 코드와 확정 계약의 경계 |
| [08 적합성 검증](spec/08-readiness-conformance.md) | 확정 계약의 검증 관점, 대표 시나리오, 인수 증거 연결 |
| [09 StateStore·reaction·URL](spec/09-preserved-contracts.md) | Store 주입·관찰·URL·컬렉션 전송의 현행 계약과 이관 근거 |
| [10 값 상세](spec/10-value-contracts.md) | State의 missing 읽기·undefined·숫자 범위·표현·정규화·미지원 값/순환 거절, literal/escape, 시간 의존 계산, 타입별 비교, 격리·읽기 snapshot, 날짜 경계 |
| [11 선택 차트](spec/11-optional-charts.md) | core 기본 제공과 구별하는 차트 계약·엔진 범위·독립 실험과 제품 구현의 구분 |

`[E01]` 등의 근거 표기는 결정 근거 식별자다. E01–E42는 원 통합 명세의 색인이고 E43–E69은 보관 원문 직접 대조와 방 기록 회수로 보완한 근거다. 회수 요약과 원문 전문은 [색인](history/evidence-index.md)에서 구별한다. U01–U41은 이관 후 프로젝트 대화에서 확정한 명확화·값 계약·실행 실험·CEL 패치 진행 전제·검증 진행·도구 구현의 근거다. 해당 대화를 읽어야만 이 명세를 해석할 수 있도록 작성하지 않는다.

JS/TS의 실제 API는 [패키지 사용법](../packages/core/README.md)과 [공개 타입](../packages/core/src/index.d.ts), 실행 가능한 CEL 프로필은 [지원 문서](handoff/core-cel-support.md)를 따른다. U28–U36의 독립 실험·누락 보완·실패 전후 증거는 [검증 진행표](handoff/verification-ledger.md)에 보존한다. 그 시점의 미구현 표기는 현재 진행 상태가 아니다.

## 1 이 문서의 상태 표시와 사용법

- **확정**: 사용자의 명시적 결정·수락 또는 명시적인 판단 위임 범위에서 담당자가 결정해 근거를 남긴 내용. 직접 승인과 위임에 따른 선택은 이력에서 구별한다.

- **구체화 필요**: 이미 선택한 기능과 책임을 구현 가능한 필드·타입·오류·경계 규칙으로 고정하는 일.

- **이전 확정 / 통합 대조 필요**: 과거에 승인됐고 폐기 결정은 없지만, 이후 구조와 맞춰야 하는 내용. 새로운 미결 요구로 취급하지 않는다.

- **구현 제안**: 아직 채택하지 않은 SDK 이름·의존성·내부 구현 방법. 예시만으로 확정하지 않는다.

- **보류 / 대체**: 사용자가 미뤘거나 이후 결정으로 바뀐 내용.

논의할지 판단하는 사용자 기준은 두 가지다. **없으면 핵심 흐름이 성립하지 않는가? 나중에 추가하면 설계를 크게 바꿔야 하는가?** 편리하다는 이유만으로 상위 설계 의제를 늘리지 않는다. 큰 의제를 정리하기 전에는 필드명·API 인자·세부 정책으로 내려가지 않는다. [E01]

JSON 예시는 확정된 구조의 의미를 설명한다. 외부 코드형 Component/Action은 명시적으로 등록되어 있어야 하며, 실제 API·스키마 구현으로 실행 검증했다는 뜻은 아니다. 설명용 계약과 미결 세부를 예시 옆에 표시한다.

## 2 가장 큰 그림과 설계 트리

추진 순서는 **공통 계약 → 프레임워크 독립 core → Svelte 렌더러 → 서비스 확장**이다.

| 영역 | 확정된 범위 | 구현·검증 경계 |
|---|---|---|
| 리소스 | Datasource Query Variable Action Component View Type | 스키마 프로필·등록 검증·공통 오류 |
| 상태와 데이터 | Value/State/Query 포트, State/Derived, Query 사용 인스턴스 | 직렬화와 CEL 구현체 적합성 |
| UI 구성 | 단일 render 루트, componentRef, inputs, slots, on, when, repeat | 코드형 어댑터 API와 테스트 |
| 동작 | 순차 단계, If/Assert, 명시 Query, SetState, RefreshQuery, 코드 Action | SDK 시그니처와 취소 신호 전달 API |
| 실행 경계 | 현재 리소스로 요청 구성, 필요시 서버 비밀정보 주입 | 요청 DTO와 서비스 연결 API |
| 변경과 에이전트 | 공통 탐색·설명·변경·호출, 코어 상태/구성 원자 적용 | 부분 변경 프로토콜과 충돌 처리 |
| 후속 | Dart core와 Flutter, 선택 UI 패키지 | Theme, scoped slot 데이터, 드래그 편집기 |

공통 리소스・상태・실행 책임은 이미 결정했다. 위 마지막 열은 언어별 구현과 테스트로 확인할 경계이며 JS/TS의 미구현 목록이 아니다. 과거 승인에서 이어지는 [Store·URL 등의 현재 의미](spec/09-preserved-contracts.md)를 유지한다. [E02]

## 3 최상위 확정 결정

### 3.1 두 목표는 같은 실행 모델을 사용한다

1차 목표는 미리 정의된 리소스를 서비스가 주입해 화면·대시보드·위젯을 구성하는 것이다. 에이전트 없이도 완전히 동작해야 한다. 2차 목표는 에이전트의 동적 UI 생성, 현재 상태 변경, 컴포넌트 추가·교체다. 에이전트는 별도 UI 엔진이 아니라 같은 계약과 코어를 사용하는 요청 주체다. [E03]

기존 JSON 모양과 A2UI 채택 이력을 보존하는 것 자체는 목표가 아니다. 기능 요구사항이 우선이며 기존 스펙의 철학만 차용하고 실행기를 직접 구현하는 선택도 허용한다. 단, 그 사실이 모든 기존 결정을 무효로 만들지는 않는다.

### 3.2 공통 계약과 구현을 분리한다

- 계약은 언어·프레임워크에 독립적이다. JSON 필드뿐 아니라 상태·조회·동작의 의미도 포함한다.

- JS 코어는 DOM·Svelte에 종속되지 않는다. Svelte·React는 같은 JS 코어를 사용할 수 있다.

- 우선 JS 코어와 Svelte 대응, 이후 Dart 코어와 Flutter 대응이다.

- 바닐라 DOM 컴포넌트를 먼저 만들고 Svelte가 이를 감싸야 한다는 결정은 아니다. 화면 구현은 각 렌더러가 맡는다.

- U46·D103에서 임시 바닐라 playground와 shadcn 갤러리를 제거했다. 패키지 사용은 각 공개 README를 따르며, UI 검증은 패키지를 직접 마운트하는 내부 fixture로 수행한다. 도구 제거는 core·renderer·UI 패키지의 공개 계약이나 지원 목록을 변경하지 않는다. [제거와 검증 범위](handoff/temporary-tools-removal-2026-11-04.md)를 따른다.
- U39–U40의 [Svelte 클라이언트 렌더러](../packages/svelte/README.md)는 공개 core projection·수명·이벤트에 Svelte 구현을 연결한다. `@viewstem/svelte`의 `createRenderer()`만으로 시작하며 기본 UI·Action·테마 자동 등록 없이 호스트가 Component 계약과 구현을 각각 등록한다. 실제 패키지 검증과 지원 한계는 [인계](handoff/svelte-implementation-2026-11-02.md)를 따른다.
- U44의 [Svelte UI 패키지](../packages/svelte-ui/README.md)는 별도의 명시적 ComponentSet으로 shadcn 카탈로그를 제공한다. 묶음 등록은 계약과 구현을 원자적으로 등록하며, core의 JSON DSL·State 엔진에 UI 의존성을 추가하지 않는다. 351개 JSON 원본 부품·6개 조합과 35개 native 문맥 전용 부품의 경계는 [U44 인계](handoff/svelte-ui-shadcn-implementation-2026-11-03.md)를 따른다. scoped slot 값 전달이나 ECharts/Canvas 계약을 확장하지 않는다.
- D133의 [`@viewstem/ui` 프로토타입](../packages/ui/README.md)은 공개 core View를 빌려 브라우저 DOM에 반영한다. D134에서 Basecoat 스타일과 Vanilla JS 컨트롤러로 대응 42개 계열을 연결했다. D135에서 TanStack Table Core 기반 Data Table과 Zag Vanilla 기반 Calendar·Range Calendar·Date Picker를 추가했다. 정확한 부품·입력·이벤트 범위는 패키지의 `support.json`을 따른다. 순수 JS·React·Vue·Svelte 호스트는 같은 JSON과 DOM 연결 API를 사용한다.
- D136에서 나머지 20개 계열과 하위 부품 6개를 브라우저 DOM 카탈로그에 추가한다. 메뉴 계열은 Zag Vanilla의 중첩 메뉴 동작을 공유하고 Carousel은 Embla를 사용한다. 브라우저 카탈로그는 Svelte UI의 JSON Component ID 357개를 등록하며, 실제 입력·슬롯·이벤트 지원 범위는 생성된 `support.json`이 정의한다.
- D137에서 Calendar의 월 이동은 달력 뷰를 만들 때의 일자를 기준으로 계산한다. Range Calendar의 JSON 어댑터는 확정된 범위에서 바뀐 시작일과 종료일만 순서대로 발행한 뒤 전체 범위를 알린다. 브라우저 Chart는 D3 스케일을 사용해 Svelte Chart와 축·보조선의 눈금과 여백을 맞춘다.
- D138에서 `@viewstem/ui`와 `@viewstem/svelte-ui`의 기본 스타일을 Vega로 전환한다. Neutral 색상 팔레트와 기존 JSON 계약은 유지한다. Svelte 패키지는 고정 shadcn-svelte 리비전의 Vega 원본을 사용하고 DOM 패키지는 Basecoat 1.1.0의 Vega CSS를 사용한다.

- Rust/WASM 통합 코어는 검토했지만 현재 채택 경로는 아니다.

- 개인 계정의 도메인 독립 Viewstem과 회사 계정의 업무 확장을 분리한다. 회사 라이브러리가 core를 사용하며 역방향 의존은 두지 않는다. 개인 모노레포에서 core와 Svelte 패키지를 분리하는 방향이며 `@viewstem/core`·`@viewstem/svelte`는 명명 기준이다. 실제 npm scope 확보·GitHub 소유 위치·라이선스·배포는 별도다. [E41]

### 3.3 실행 중 화면의 코어가 화면 실행을 관리한다

서비스·사용자·원격 에이전트 모두 그 화면의 공통 변경·실행 인터페이스를 사용한다. 에이전트 서버에 별도의 화면 상태와 Query 실행 체계를 만들어 이중으로 관리하지 않는다. 실제 데이터·업무 권한 검사는 요청을 받는 대상 API 서버가 맡으며, 중계하는 서비스 서버는 비밀 인증정보의 사용 정책과 안전한 주입을 맡는다. 이는 모든 코어가 반드시 브라우저에서만 실행돼야 한다는 제한도, 화면 종료 후의 지속 백그라운드 업무를 보장한다는 뜻도 아니다. [E05, E23]

### 3.4 공개 문서와 Playground 배포

공개 문서 사이트는 **Astro와 Starlight**로 구축한다. Starlight가 영·한 문서 탐색과 검색을 맡고, 같은 사이트의 `/playground/`에서 Svelte로 만든 편집·실행 화면을 제공한다. [D106](history/decision-register.md#a-현재-채택한-결정)

공개 문서의 좌측 메뉴는 시작하기, 핵심 개념, 가이드, 레퍼런스 안내, DSL 레퍼런스, @viewstem/core, @viewstem/ui, @viewstem/svelte, @viewstem/svelte-ui로 구성한다. 핵심 개념은 View와 Component, 값과 입력, State, 계산된 값, 이벤트와 Action, Query와 데이터, 조건과 목록, Component 재사용, 리소스와 타입의 9개 페이지로 구성한다. 각 페이지에서 정의·최소 코드·예상 결과·주요 실행 의미를 설명하고 대표 실습을 연결한다. 읽기 순서는 좌측 메뉴와 하단 이전·다음 탐색으로 제공하며, 개념 설명을 예제 링크 목록으로 대체하지 않는다. [조사와 페이지별 구성](handoff/docs-core-concepts-2026-11-05.md), [D110](history/decision-register.md#a-현재-채택한-결정)을 따른다. 문서 본문의 제목에서 페이지 목차를 만들고, 정적 빌드에서 Pagefind 검색 색인을 생성한다. [D108](history/decision-register.md#a-현재-채택한-결정)

패키지 문서는 개요 → 작업별 사용 가이드 → 상세 API 레퍼런스 순서로 구성한다. 공개 export·타입·구현을 기준으로 시그니처, 옵션·기본값, 반환값, 오류와 수명을 한국어·영어로 제공한다. DSL은 리소스와 표현식의 필드 계약을 별도로 설명한다. Svelte UI는 전체 계열 목록에서 상세 페이지로 연결하며 지원 메타데이터에 따라 JSON 지원과 네이티브 Svelte 전용 기능을 구분한다. @viewstem/ui는 한·영 개요, 브라우저 마운트 가이드, API와 66개 계열 상세 페이지를 제공한다. 기존 Svelte UI 예제 JSON을 수정 없이 공유하고 각 패키지의 공개 렌더러로 직접 실행한다. DOM 입력·슬롯·이벤트 표는 DOM 패키지의 지원 메타데이터에서 생성하며, 각 상세 페이지에 옵션 편집과 전체 앱 연결 코드를 제공한다. [D140](history/decision-register.md#a-현재-채택한-결정) 사이트 본문에서 사용법을 설명하고 소스 링크로 설명을 대체하지 않는다. [D116](history/decision-register.md#a-현재-채택한-결정), [조사·구성·검증](handoff/docs-package-reference-2026-11-05.md)을 따른다.

공개 문서의 상세 API 페이지는 상위 경로와 현재 메뉴 위치를 표시한다. UI의 지원 계열 66개를 좌측 컴포넌트 메뉴에 모두 나열하고, 현재 항목 표시·같은 언어의 인접 계열 이동을 제공한다. 각 계열 상세 페이지에는 실제 공개 렌더러로 실행되는 미리보기와 동일한 View JSON, 앱 등록 예제를 함께 제공한다. JSON에 직접 등록되지 않는 네이티브 문맥 부품의 경계는 상세 레퍼런스에서 유지한다. [D122](history/decision-register.md#a-현재-채택한-결정)를 따른다. 제목 크기는 h1 → h2 → h3 → h4 순서를 유지하고, 참조 표보다 목적·사용 예제를 먼저 설명한다. 일반 HTML·SVG 입력과 큰 중첩 타입은 펼침 영역으로 분리하되 지원 계약을 생략하지 않는다. 공통 헤더의 테마 선택은 밝게·어둡게·시스템 설정을 지원하며 모든 사이트 진입점에서 같은 선택을 적용한다. [D117](history/decision-register.md#a-현재-채택한-결정), [사이트 리뷰](../apps/docs/review/2026-11-05/review.md)를 따른다.

주요 UI 예제의 옵션 편집은 한국어·영어에서 옵션 설명, 실제 View JSON 필드, 실행 UI, 상세 레퍼런스를 연결한다. 첫 대상은 Button·Input·Checkbox·Switch·Slider·Tabs·Dialog·Sonner다. 표시·복사·실행에는 같은 선언을 사용하고, 실행 중 클릭·입력에 따른 State 변화는 선언에 역기록하지 않는다. 옵션 변경은 실행 상태를 다시 초기화하며, 현재 설정 재실행과 기본 예제 복원을 구별한다. 필드로의 스크롤은 명시적 조작에만 수행한다. [D124](history/decision-register.md#a-현재-채택한-결정), [구현·검증](../apps/docs/review/2026-11-05/controls-review/implementation.md)을 따른다.

Svelte UI 문서의 실행 미리보기는 고정된 공식 shadcn-svelte 소스의 실제 컴포넌트를 사용한다. 사이트 조작부는 아래 D130의 별도 shadcn-svelte 구성을 따른다. 사이트 브랜드 색상으로 컴포넌트를 재해석하지 않으며 기본 Neutral 색상·기본 크기를 유지한다. 본문 밖에 열리는 포털에도 같은 원칙을 적용하고 공통 헤더의 사이트 테마와 구분한다. 옵션 입력을 일반 HTML 폼과 자체 시각 스타일로 대체하지 않는다. 모든 66개 계열은 원본 부품 또는 공식 예제의 원본 부품 조합을 사용한다. 원본 Tailwind preflight 전체를 UI 범위에 적용하고 문서 reset이 원본 utility를 덮어쓰지 않도록 cascade 순서를 고정한다. 원본과의 차이는 소스 출처, 렌더링 스타일, 실제 상호작용을 구분해 검증한다. 전체 감사는 [D126](history/decision-register.md#a-현재-채택한-결정)과 [검증 기록](../apps/docs/review/2026-11-05/shadcn-full-audit.md)을 따른다. [D125](history/decision-register.md#a-현재-채택한-결정), [수정·검증](../apps/docs/review/2026-11-05/shadcn-fidelity.md)을 따른다.

사이트 자체의 기본 UI는 공식 Astro 설치 방식의 shadcn-svelte로 통일한다. 공식 CLI가 생성한 원본 부품을 사용하고 React 런타임·통합·관련 의존성은 포함하지 않는다. `apps/docs/src/components/ui`의 사이트용 컴포넌트와 Neutral 테마를 사용하고, 헤더·검색·사이드바·목차·메뉴·페이지 탐색·옵션 입력·예제 파일 탭·Playground 조작부를 포함한다. 사이트 UI를 만들기 위해 `@viewstem/svelte-ui`를 사용하지 않는다. 선언형 JSON의 실제 실행 영역만 기존 Svelte 렌더러와 라이브러리 컴포넌트를 유지한다. CodeMirror 편집기와 문서 본문은 각각 편집·읽기 역할을 유지하며 사이트 테마 토큰을 따른다. D127의 React 구현 선택을 대체하며 기존 디자인·한영·모바일·테마·사이드바 스크롤 및 D128 작업 영역의 동작은 유지한다. [D130](history/decision-register.md#a-현재-채택한-결정), [적용 범위·검증](../apps/docs/review/2026-11-06/site-svelte.md)을 따른다.

컴포넌트 문서의 실행 예제는 하나의 작업 영역에서 제공한다. 넓은 화면에서는 미리보기·JSON 전환 영역 옆에 주요 옵션을 두고, 좁은 화면에서는 미리보기·옵션·JSON 탭을 사용한다. 옵션 설명·전체 JSON 경로·레퍼런스는 필요할 때 펼친다. 탭 전환은 미리보기의 실행 상태를 보존하며 옵션 변경·재실행·기본 예제 복원은 각 기존 의미를 유지한다. JSON 위치 이동과 옵션 딥 링크는 해당 영역을 열고 포커스를 연결한다. JavaScript 없이도 초기 JSON과 실행 설정 코드를 읽을 수 있다. [D128](history/decision-register.md#a-현재-채택한-결정), [레퍼런스·구성·검증](../apps/docs/review/2026-11-05/component-workbench.md)을 따른다.


홈·예제·Playground·문서는 동일한 공통 헤더를 사용한다. 로고, 문서·예제·Playground 탐색, GitHub, 현재 페이지를 유지하는 언어 전환을 공유하고 문서에만 검색과 모바일 문서 메뉴를 추가한다. 모바일에서는 공통 탐색 아래에 문서 도구 행을 둔다. [D111](history/decision-register.md#a-현재-채택한-결정)

사이트 전체의 한글·영문 제목·본문·UI는 Pretendard, 코드와 편집기는 D2Coding을 사용하며 코드 합자는 끈다. 기본 서체에 없는 기호는 Noto Sans Symbols 2로 보완하고 이모지는 운영체제 컬러 이모지, UI 아이콘은 SVG를 사용한다. 웹폰트와 라이선스는 사이트에 포함하며 이 선택은 라이브러리 소비자의 폰트를 강제하지 않는다. 페이지 제목·공통 메뉴에 필요한 Pretendard 부분 파일과 기본 코드 폰트를 미리 요청하고, 본문·코드 폰트가 늦게 도착하면 현재 화면에서 대체 폰트를 유지해 읽는 중 위치가 바뀌지 않게 한다. 보조 기호 폰트는 시스템 문자 폰트 뒤에서 누락 기호를 보완한다. [D118](history/decision-register.md#a-현재-채택한-결정) [D112](history/decision-register.md#a-현재-채택한-결정)

사이트의 설명과 탐색에는 장식용 뱃지·반복 카드를 사용하지 않고 제목, 여백, 필요한 구분선으로 위계를 표현한다. 홈의 실행 흐름은 순서 목록, 특징은 열린 단락, 예제 진입은 텍스트 링크 목록으로 구성한다. 문서의 이전·다음 탐색은 구분선 아래 방향별 링크로 제공한다. 실행 화면·코드·팝오버의 기능적 경계와 라이브러리 사용법을 보여 주는 예제의 Card·Badge는 유지한다. [D113](history/decision-register.md#a-현재-채택한-결정)

사이트 모션은 상태 변화와 탐색 방향을 이해하도록 보조한다. 홈의 일부 주요 영역에 한 번만 진입 효과를 적용하고 필터 변경, 실행 결과 교체, 메뉴·검색 열림, 앵커 목적지에 짧은 피드백을 제공한다. 상태 변경·입력·탐색은 애니메이션 완료를 기다리지 않으며, 본문을 기본적으로 숨기거나 모든 문단에 반복 진입 효과를 적용하지 않는다. `prefers-reduced-motion`에서는 모션을 생략하고 실행 중인 자체 모션도 취소한다. [D114](history/decision-register.md#a-현재-채택한-결정)

문서와 예제의 이전·다음은 같은 방향별 탐색 표현을 사용하며 모바일 예제는 실행 결과 아래에서 다음 실습으로 이어진다. 모바일 예제 목록은 본문에서 한 번만 제공한다. Playground는 빈 상태의 첫 예제·시작 문서 연결, 수동 실행 안내와 미실행 변경 표시, 같은 탭의 언어 전환에도 보존되는 초안을 제공한다. 복원한 초안은 자동 실행하지 않는다. 한국어 문서 검색·코드 복사 UI도 한국어로 제공한다. [D115](history/decision-register.md#a-현재-채택한-결정), [검토·검증](handoff/docs-site-consistency-2026-11-05.md)을 따른다.

시작하기의 문서 순서는 개요, 설치, 빠른 시작이다. 개요와 빠른 시작에서 브라우저 예제로 갈 수 있다. 설치에서 패키지 준비를 다루고, 빠른 시작에서는 Svelte 앱에서 첫 View를 실행한다. [D109](history/decision-register.md#a-현재-채택한-결정)

공개 문서와 Playground는 **Cloudflare Workers Static Assets**로 배포한다. 첫 버전은 정적 빌드 결과를 Cloudflare에 올리고, Playground의 Viewstem 런타임은 방문자의 브라우저에서 실행한다. 기본 주소는 별도 도메인 구매 없이 `workers.dev`를 사용한다. [D104](history/decision-register.md#a-현재-채택한-결정)

실제 공개 주소와 빌드·PR 미리보기 설정은 사이트 구현 및 배포 단계에서 정한다.

공개 Playground는 하나로 제공한다. 첫 버전은 `@viewstem/svelte` 렌더러와 `@viewstem/svelte-ui/shadcn` UI 세트를 사용한다. 다른 Svelte UI 세트를 지원하게 되면 같은 Playground에서 지원 세트 중 하나를 선택할 수 있게 한다. [D105](history/decision-register.md#a-현재-채택한-결정)

공개 홈은 제품 소개, 고객 목록 실행 흐름, 주요 특징, Svelte 연동, 폼·대시보드 가이드, 문서 진입 순으로 구성한다. 주 버튼은 첫 View를 실행하는 Quickstart로 연결한다. [D107](history/decision-register.md#a-현재-채택한-결정)

## 4 리소스와 런타임의 확정 구분

| 이름 | 책임 | 혼동하면 안 되는 것 |
|---|---|---|
| Datasource | 공통 연결 대상·설정과 서버가 해석할 인증 참조 | 실제 비밀값·접근 권한 자체 |
| Query | 재사용 요청 정의와 여러 결과의 결합·변환. CRUD 요청도 정의 가능 | UI 표시, 임의 서버 변경의 자동 반복 |
| Variable | 명시적 입력에서 값을 계산하는 재사용 정의 | 사용자가 수정하는 실제 State |
| Action | 호출로 시작하는 API·상태 변경·재조회·조건 분기 등의 동작 조합 | 이벤트 자체, 자동 롤백 트랜잭션 |
| Component | UI·Query·Variable·State·Action 등을 필요한 만큼 포함하는 재사용 기능 단위 | 항상 상태나 Query를 가져야 하는 거대한 단위 |
| View | 화면 실행 진입점과 구성·외부 연결 | Component와 별도의 상태·조회 엔진 |
| Type | 데이터 구조와 검증 제약의 선택적 독립 정의 | 값·상태 공유, 자동 변환, UI 배치 |

확정 근거: 복합 Query [E06], StateStore [E07], Type [E08], Component/View 명칭 [E09].

- Widget은 Component로, Dashboard는 일반 화면을 포괄하는 View로 확장했다. 제품 UI에서 역할 이름으로 부르는 것까지 금지하는 것은 아니다.

- Calculation이라는 독립 종류를 Variable 옆에 추가하지 않는다.

- DataPipeline은 별도로 만들지 않고 복합 Query가 조회 결과의 join·concat·변환을 담당한다.

- StateStore는 실행 중 상태를 보관·변경·구독하는 코어 기능이다. 별도 State 리소스 종류를 추가하지 않는다.

- Catalog/등록 정보는 실행 환경이 지원하는 구현·입출력·이벤트를 설명하는 기반이지 여덟 번째 업무 리소스가 아니다. 구체 카탈로그 포맷은 최종 고정되지 않았다.

- Theme는 1차 필수 계약에서 제외한다. 레이아웃은 Row/Column/Grid 같은 Component가 담당하고, Asset은 이미지·아이콘 참조로 처리한다. Bundle은 별도 종류 없이 리소스 배열로 전달한다. slots는 현재 1차 지원 범위이며 독립 Slot 리소스는 추가하지 않는다. [E10, E41]

### 4.1 정의와 인스턴스

Component는 필요한 기능만 포함한다. 제목·값만 표시하는 카드도 가능하고, 조회·계산·선택 상태를 포함한 발전소 분석 패널도 가능하다. 같은 정의를 두 번 쓰면 두 인스턴스가 생긴다. 내부 상태와 실행은 기본적으로 분리되며 공유는 명시적으로 연결한다. 같은 Query 정의를 썼다는 이유만으로 실행 결과가 자동 공유되지는 않는다. [E11]

독립 참조와 인라인 정의 모두 지원한다. 정의 위치만 다르고 입력·검증·실행 의미는 같아야 한다. 인라인 정의도 주변 상태를 몰래 읽는 별도 계산 모델이 아니다. 참조와 인라인 중 하나를 선택한다는 의미는 유지한다. [E12]

**공통 외피:** 독립 리소스 정의는 최상위 필수 `kind`·`id`·`spec`과 선택적 `name`으로 구성한다. name은 변경·중복 가능한 표시 이름이지 참조 키가 아니다. `name`은 최상위에 두며 별도 `metadata` 객체로 감싸지 않는다. 내부 Port·State·노드·단계별 옵션은 평탄화한다. 다만 Action의 참조 대신 넣는 인라인 `spec`은 실제 대상 리소스 본문이므로 유지한다. `spec.kind.spec`을 기계적으로 반복하지 않는다. 선언과 실행 값은 구별한다. [E27, E41]

**등록 식별 명확화(2026-10-29):** 같은 등록 집합에서 독립 정의는 `(kind, id)`로 식별한다. 같은 종류의 같은 ID는 중복 오류이고, 다른 종류는 같은 ID를 사용할 수 있다. 코드형·선언형 Component는 하나의 Component 식별 범위를, 코드형·선언형 Action은 하나의 Action 식별 범위를 사용하므로 구현 방식이 다르다고 같은 종류의 중복을 허용하지 않는다. 이 규칙은 이번 사용자 개선 요청에 따라 채택한 명확화다. 아래 인스턴스 ID의 소유 범위와 구별한다. [U01]

`xxxRef`는 필드가 기대하는 종류와 문자열 ID의 조합으로 해석한다. 예를 들어 Query와 Component가 모두 `summary`라는 ID라면 `queryRef: "summary"`는 Query만, `componentRef: "summary"`는 Component만 찾는다. `summary`라는 Component만 있고 같은 ID의 Query가 없으면 `queryRef: "summary"`는 참조 오류이며 다른 종류로 fallback하지 않는다. 종류·버전을 ID 문자열에 접두사로 넣거나 새 참조 객체를 요구하지 않는다. [U01]

**10월 26일 명명 변경 확정:** 독립 정의의 ID 참조는 `datasourceRef`·`queryRef`·`variableRef`·`actionRef`·`componentRef`·`typeRef`로 통일하고 값은 문자열 ID다. 이전 datasource/query/component 등 bare 참조 키를 대체한다. 일반 `{kind,id}` 객체를 강제하지 않는다. 코어는 필드별 대상 종류·존재를 검증한다. `kind`·`id`·`spec`·`inputs`, 런타임 `@path`·`target`, JSON Schema 자체의 `type`·`$ref`는 이 명명 변경 대상이 아니다. 타입 계약은 `schema` 또는 `typeRef` 중 하나로 표현하며 JSON Schema 내부 `type`과 포트의 `required`를 분리한다. 인스턴스 식별자는 정의 ID와 별개이며, 실제 사용처가 없는 참조 기능을 새로 만들지 않는다. [E39]

```json
{
  "datasourceRef": "plant-api"
}
```

```json
{
  "queryRef": "plants",
  "inputs": {
    "organizationId": "org-a"
  }
}
```

선언형 Component 중첩을 허용하되 자기 참조와 A→B→A 같은 포함 순환은 **등록의 정의 검증 단계에서 오류**로 거절한다. 사용하지 않은 순환 정의도 실제 인스턴스 생성까지 검증을 미루지 않는다. 등록은 정의 준비이고, 정의를 등록했다는 이유로 Query를 실행하지 않는다. [E13]

### 4.1.1 인라인 정의의 사용 위치

**확정(U13, 위임에 따른 구체화):** 참조 대신 넣는 인라인 본문은 다음 필드를 사용한다. 본문에는 독립 리소스의 최상위 kind/id/name을 반복하지 않는다. 각 행의 두 선택지는 정확히 하나만 허용하며, 입력은 선택한 정의의 공개 ports로 명시 전달한다.

| 사용 위치 | 참조 / 인라인 본문 | 호출 위치에 남는 값 |
|---|---|---|
| View/Component의 queries 항목, Query의 중첩 Query source | queryRef / query | inputs; 실행 설정은 queries 사용 맵에서만 |
| HTTP source | datasourceRef / datasource | request; 인라인 datasource는 Http spec 본문 |
| Derived | variableRef / variable | inputs, Derived 자체 schema/typeRef |
| render·slots의 Component 노드 | componentRef / component | 노드 id·inputs·slots·on·when·repeat |
| on의 Action 호출 | actionRef / action | inputs와 선택적 호출 연결 id; emit과는 배타적 |
| Action의 Query/Variable/Action 단계 | 기존 xxxRef / spec | 기존 kind·inputs·선택적 단계 id 유지 |
| 호스트의 View 적용 | viewRef / view | inputs; view는 View spec 본문 |

인라인 필드는 객체만 받으며 옛 bare 문자열 참조를 복원하지 않는다. Component 노드에 kind/spec 외피를 새로 요구하지 않는다. 인라인 정의도 자신의 ports만 보며, 주변 상태나 이벤트는 호출 위치의 inputs를 통해 전달한다. 인라인 코드 함수는 JSON에 넣지 않고 등록된 코드 Component/Action을 참조한다.

익명 정의는 소유 정의와 안정적인 선언 위치(노드는 id, 사용 맵은 키)로 식별하고 전역 registry에 독립 ID로 등록하지 않는다. 배열 인덱스만으로 식별하지 않으므로 같은 노드 id의 재정렬은 정의 교체가 아니다. 위치를 옮기거나 참조/인라인 대상을 교체할 때는 아래 인스턴스 정체성 규칙을 적용한다. 인라인 본문 안의 참조도 동일한 정적 참조·포함 순환 검사를 받는다.

### 4.2 인스턴스 식별과 유지 범위

10월 23일 수락한 방식은 **View·재사용 Component 인스턴스 단위의 이름 공간**이다. 일반 Row/Column 등의 배치 컨테이너는 새로운 이름 공간을 만들지 않는다. 같은 범위 전체에서 ID가 유일해야 한다. A와 B의 내부에는 각각 chart를 둘 수 있지만, A 내부의 서로 다른 Row에 chart를 중복 선언할 수는 없다. [E14]

- 같은 범위·같은 인스턴스 ID(반복 시 같은 안정적 항목 key)·같은 대상 정의를 사용하는 인스턴스의 순서/배치 변경: 코어 소유 상태 유지.

- inputs 변경: 같은 인스턴스로서 관련 계산과 Query 갱신. 의미상 무효가 된 선택값을 어떻게 초기화하는지는 별도 동작 규칙.

- 다른 Component 범위로 이동하거나 다른 정의로 교체: 기본적으로 새 인스턴스.

- 제거 후 재생성: 같은 ID라도 새로운 수명.

- 반복 항목: 배열 위치가 아니라 안정적인 데이터 키로 구별.

- 보장 대상은 코어 소유 상태다. 포커스·스크롤·외부 차트 내부 상태까지 자동 보존된다고 약속하지 않는다.

작성자가 전역 UUID를 모든 내부 노드에 붙일 필요는 없다. 실행 대상 식별자는 코어가 제공한다. 다만 핸들·주소·세대의 의미는 U13의 최소 SDK를 따르며 구체 타입 구현은 검증 과제다. ‘조회 경로’와 ‘같은 수명을 유지하는 식별자’를 동일시하지 않는다.

## 5 상태와 입력의 확정 의미

상태 선언, 실제 상태값, 저장소를 구분한다. 상태 선언에는 이름·타입·초깃값 등이 들어가며 실제 값은 실행 인스턴스에 속한다. StateStore는 렌더러 없이도 사용할 수 있다. [E07]

**확정:** View와 Component의 `spec.states`는 이름별 맵이며 `kind: State | Derived`를 평탄하게 선언한다. State는 `schema` 또는 `typeRef`와 `initial`, Derived는 `schema` 또는 `typeRef`와 `variableRef` 또는 인라인 `variable`, `inputs`를 사용한다. `/states/이름`은 실제 값을 읽는 경로이고 Derived 쓰기는 거절한다. JSON Schema의 default를 State 초기화 명령으로 사용하지 않는다. [E33, E41]

| 소유자 | 예 | 수명과 공유 |
|---|---|---|
| Component 인스턴스 | 선택 장비, 폼 입력, 활성 탭 | A와 B는 기본 분리. 같은 인스턴스 내부 자식들이 명시적으로 공유 가능 |
| View 인스턴스 | 공통 날짜, 화면 필터 | 해당 View의 여러 Component에 연결 가능 |
| 서비스 | 서비스 전체 선택 발전소·조회 조건 | View 교체만으로 임의 제거하지 않음 |

소유권은 수명 책임이고 쓰기 권한과 다르다. **서비스 소유 상태라는 이유만으로 무조건 읽기 전용이 아니다.** 변경 가능한 State에 허용된 양방향 연결을 할 수 있다. 이전의 ‘서비스 채널은 위젯 읽기 전용’ 정책을 이 새 소유권 원칙과 혼합하면 안 된다.

Port는 공개 입력 계약, `inputs`는 사용하는 쪽의 연결이며, 수신 리소스 내부 경로는 `/ports/이름`이다. Value는 **값**, State는 **기존 상태 셀**, Query는 **기존 논리적 Query 사용 인스턴스**를 받는다. Value에 State를 읽어 넣을 수 있지만 그 원본의 쓰기 대상까지 전달하는 것은 아니다. State/Query 연결은 복제·상호 동기화가 아니라 대상 정체성을 공유한다. 고정값이나 계산 결과에는 쓰기 가능한 저장 위치가 없다. [E32]

Variable 결과, Query 결과, 수정 가능한 State를 서로 구분한다. Query 결과를 폼 편집 State로 복사하는 것과 결과 자체를 덮어쓰는 것은 다르다.

### 5.1 Port와 입력 연결

`spec.ports`는 이름별 공개 입력 맵이다. 내부 spec·refType·valueType를 두지 않으며 kind는 **Value / State / Query**다. QueryInstance는 설명 개념이지 최종 kind 이름이 아니다. `access` 필드는 이번 범위에서 제외·추후 검토로 남겼다. 실제 대상의 쓰기 권한 검사는 별개로 유지한다.

| 리소스 | 허용하는 Port kind |
|---|---|
| Query, Variable | Value만 |
| Action, Component, View | Value, State, Query |
| Datasource, Type | ports 없음 |

```json
{
  "ports": {
    "itemId": {
      "kind": "Value",
      "schema": {
        "type": "string"
      },
      "required": true
    },
    "selection": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "required": true
    },
    "list": {
      "kind": "Query",
      "required": true
    }
  }
}
```

위 조각은 Action/Component/View의 spec 안에 놓는 포트 계약 예시다. Value에는 상수·계산값·State를 읽은 값 모두 전달할 수 있다. 화면의 Value 연결은 반응형일 수 있지만 쓰기 대상은 전달하지 않는다. State 포트는 기존 셀을 연결하고 Query 포트는 기존 사용 인스턴스를 연결한다. Query/Variable이 Value만 받는다는 제약은 상태 셀을 변경할 권한을 전달하지 않겠다는 것이며, Query의 서버 요청을 읽기 전용으로 강제하는 규칙은 아니다. [E32, E34]

별도 targets/bindings 맵이나 /bindings 이름 공간을 추가하지 않고 ports 선언 → 호출 위치 inputs → 수신 측 /ports/이름으로 연결한다. inputs는 바로 그 참조/인라인 리소스 사용 객체에 속하므로 한 곳에 두 리소스가 있어도 각각 inputs를 둔다. 동일 참조를 전달하면 동일 대상 정체성을 유지한다. 수명 종료된 대상을 새 대상처럼 쓰지 않으며, Value 객체를 몰래 변이하여 State 쓰기 규칙을 우회하지 못하게 입력을 격리한다. 오류 코드·상태 주소는 [최소 SDK](spec/07-host-integration.md)의 U13을 따른다.

### 5.1.1 입력 생략과 포트 기본값

**확정(U13):** 포트의 required는 생략 시 false다. Value 포트에는 선택적 `default` 리터럴을 둘 수 있으며 등록 시 해당 포트 스키마로 검증한다. required:true와 default의 동시 선언은 설정 오류다. State/Query 포트에는 default를 허용하지 않으며, 입력 생략으로 셀이나 Query를 생성하지 않는다. schema.default는 여전히 주입 명령이 아니다.

default는 호출 위치의 inputs에서 해당 키가 생략됐을 때만 사용한다. 명시 null, 잘못된 값, 연결된 표현식의 missing/pending/error를 default로 덮지 않는다. 리터럴 기본값은 리소스 문맥을 읽는 표현식이 아니며 인스턴스·호출 간 변이 가능한 원본을 공유하지 않는다. 기본값 없는 선택 입력은 missing으로 남는다. 선언하지 않은 입력 키는 연결 오류다.

필수 키 자체가 빠졌으면 구조 검증 오류다. 필수 키에 유효한 표현식을 연결했지만 원본이 missing/pending이면 자동 화면·Query는 입력 준비를 기다리고, 명시 Action/Query 호출은 INPUT_NOT_READY로 실행 전에 실패한다. 오류인 의존 입력은 오류를 전파한다. optional 포트에 명시한 표현식의 pending/error 역시 의존성 의미를 유지한다. 입력값이 실제로 준비된 뒤에만 스키마를 검증한다.

### 5.1.2 쓰기 가능한 State 포트의 계약 호환성

**확정(U13):** State 포트 연결은 현재 값의 타입만 보고 허용하지 않는다. v1에서는 typeRef를 해석한 대상 셀과 포트의 **검증 스키마가 같은 계약임을 확인할 수 있어야** 연결한다. 객체 키 순서, required·enum·type 집합의 순서와 설명용 annotation 차이는 무시하되, 제약을 제거하거나 서로 다른 스키마의 일반적인 논리 동치·포함 관계를 추측하지 않는다. 로컬 참조를 펼친 검증 구조가 다르면 TYPE_CONTRACT_MISMATCH이며 공통 Type 사용으로 계약을 맞춘다.

예를 들어 현재 값이 1이어도 number 셀을 integer State 포트에 연결하지 않는다. 양쪽이 같은 integer 계약이고 셀이 missing인 경우에는 연결할 수 있으며, 값 읽기의 준비 여부는 별도로 다룬다. 이후 매 쓰기는 연결 포트와 실제 대상의 검증·쓰기 권한·수명을 모두 확인한다. Derived·Query data·읽기 전용 대상은 거절한다. 읽기만 필요한 사용처는 Value 포트를 사용한다. 더 넓은 스키마 호환성 추론은 v1의 필수 기능이 아니다.

### 5.2 초기화와 수명에서 유지하는 기존 결정

State.initial은 새 소유 인스턴스를 만들 때 한 번 적용하며 inputs 변경마다 초기화하지 않는다. 초기값 계산이 pending이면 기다리되 명시적 쓰기가 먼저 발생하면 뒤늦은 초기값으로 덮어쓰지 않는다. initial이 없다고 0·false·오늘 날짜를 만들어내지 않는다. reset은 최초 확정된 초기 스냅샷을 복원하며 매번 현재 시각으로 재계산하는 의미가 아니다.

`states`는 이름별 맵이므로 JSON 속성 나열 순서가 초기값의 의존 순서를 정하지 않는다. 같은 범위의 State를 참조하는 initial은 의존 대상부터 평가하며, 비순환인 앞쪽·뒤쪽 참조에 같은 규칙을 적용한다. 없는 참조와 초기 의존 순환은 거절한다. 다른 범위의 State는 명시 입력 없이 암묵 캡처하지 않는다. [U34]

초기값을 생략한 State의 읽기 결과와 미등록 State의 구분은 [값 계약 상세](spec/10-value-contracts.md#초기값-없는-state-읽기)를 따른다. [U07]

기본값 → URL 복원 → 입력 안정화 → Query 실행 순서를 보존한다. 임시 렌더 unmount와 코어 소유 인스턴스 폐기를 구분하며, 서비스 소유 상태는 소비 View/Component 제거로 삭제하지 않는다. 동일 정의의 서로 다른 인스턴스는 기본적으로 별도 State이고 공유는 동일 셀을 명시 연결할 때만 생긴다.

시간 의존 계산에 현재 시각을 제공하고 시간 변화 때 재평가하는 기능은 유지하되, State.initial을 반복 초기화하거나 선택 날짜를 자동 추종시키는 의미는 아니다. 타입별 변경 비교·원본을 freeze하지 않는 격리·안정 읽기 snapshot은 [값 상세](spec/10-value-contracts.md)를 따른다. [E53, E58–E60]

Derived는 의존 입력 변경으로 다시 계산하고 직접 쓸 수 없다. 계산 실패가 원본 State 변경을 되돌리지는 않는다. 실패/대기인 의존 결과를 오래된 성공값으로 가장하지 않으며 무관한 UI는 유지한다. Derived와 reaction 의존 순환은 검증한다. **같은 Store의 같은 대상 State에 reaction을 둘 이상 등록하면 거절한다.** 다른 Component가 등록해도 같은 셀을 대상으로 하면 중복이며, 서로 다른 범위의 같은 로컬 이름만으로 중복이라고 보지는 않는다. 같은 배치의 명시적 쓰기가 reaction보다 우선하고, 값 확정 뒤 Derived/Query를 계산하는 기존 정책을 유지한다. 이는 외부 API까지 포함한 트랜잭션 약속이 아니다. reaction의 현행 JSON·등록 수명은 [Store 상세](spec/09-preserved-contracts.md#store-주소관찰reaction의-현행-매핑)의 U13을 따르며 중복 거절 의미를 유지한다. [E44]

### 5.3 StateStore 주입과 관찰

서비스는 **라이브러리가 생성한 StateStore**를 소유하고 주입할 수 있다. 메서드 모양만 같은 임의 외부 Store 지원은 별도 확장 계약이 필요하다. 서비스용 공개 등록과 View/Component 수명에 따른 내부 등록을 구분하며, 누가 값을 썼는지가 생성 소유권을 바꾸지는 않는다. 과거 함수명이나 내부 관리 구현은 현재 SDK를 확정하지 않는다. [E51]

관찰은 Store 전체·단일 State·여러 State 묶음을 지원한다. 콜백은 구독 범위의 변경 후 `values`와 이번 `changes`를 받으며, 구독 직후에는 현재 값과 `changes: []`를 한 번 전달한다. 이후 해당 범위의 실제 변경에만 통지하고 한 원자 변경 묶음에는 한 번 통지한다. 등록·값 변경·제거·동일 이름의 새 수명 교체를 `added/updated/removed/replaced`로 구별한다. 값이 같아도 교체는 `replaced`이며 제거는 null 저장과 다르다. 구독 해제를 지원하고 객체 내부 필드·배열 원소 구독은 1차 제외다. [관찰 상세](spec/09-preserved-contracts.md#statestore-관찰의-확정-의미)에서 원본 보호와 새 이름 공간 매핑 경계를 설명한다. [E45]

URL 복원·실패·소유 key의 규범은 [URL 상세](spec/09-preserved-contracts.md#url-동기화의-확정-의미)를 따른다. URL에 기록할 값이 기본값과 같다는 이유로 자동 생략하지 않으며, 모든 초기 기본값을 최초 연결 때 URL에 기록하도록 요구하는 의미는 아니다. Query 서비스 콜백 직전 Set/Map 변환은 [별도 경계](spec/09-preserved-contracts.md#query-서비스-콜백의-컬렉션-변환)로 보존하며, Store 관찰값을 같은 전송용 JSON으로 바꾸는 규칙은 아니다. [E46, E47]

## 6 Query와 실행 환경 계약

### 6.1 단일 조회와 복합 조회

단일·복합 Query는 `spec.ports`·이름별 `sources`·`transform`이라는 하나의 구조로 표현한다. Request/Composite 구분 kind를 추가하지 않는다. source는 직접 HTTP 요청 또는 다른 Query 참조이며, Component는 Query의 공개 ports에 inputs를 전달한다. 내부 source를 외부에서 직접 우회 주입하지 않고 복합 Query가 명시적으로 inputs를 연결한다. 별도 DataPipeline 리소스는 추가하지 않는다.

**Query는 조회 전용 리소스라는 제한을 두지 않는다.** 생성·수정·삭제 요청도 재사용 Query로 정의할 수 있다. UI 자동 연결에는 읽기 요청을 사용한다는 작성 정책과, Action에서 명시적으로 요청을 실행하는 의미를 구분한다. HTTP 메서드만으로 부작용 유무를 판별하거나 보안을 보장하지 않는다. Action의 Query 실행은 자동 구독·자동 재시도·캐시 대체·진행 중 요청 공유 없이 명시적 호출로 실행한다. 여러 쓰기의 순서는 Query sources가 아니라 Action.steps로 표현한다. [E29]

**Query 실패 의미:** 필요한 source 하나 또는 transform 단계 하나라도 실패하면 해당 Query 전체가 실패한다. 일부 source의 결과만 성공 데이터로 반환하거나 오류를 빈 배열로 숨기지 않는다. 정상적으로 조회·변환된 빈 결과는 성공이다. 오류에는 실패한 source 또는 변환 단계의 위치를 식별할 정보를 남기며, 영향은 해당 Query와 의존 실행에 한정한다. 오류 DTO와 위치 표현은 U13의 공통 오류를 따른다. [Query 상세](spec/02-query.md#query-실패의-확정-의미)를 따른다. [E52]

### 6.2 현재 리소스 기반 실행과 선택적 서버 중계

**10월 23일 방향 확정 / U13 프로토콜 구체화:** 서비스 클라이언트와 서버는 어떤 리소스가 올지 미리 모른다는 전제로 설계한다. 라이브러리가 현재 보유한 리소스를 해석해 실행 요청을 구성한다. 최초 주입·사용자 수정·에이전트 생성 여부와 저장 여부가 실행 모델을 나누는 기준이 아니다. 개별 Query 전용 서비스 코드나 저장된 Component·View 원본 재조회를 필수로 요구하지 않는다. [E23]

1. 비밀 인증정보가 필요 없고 직접 접근 가능한 요청은 클라이언트에서 실행한다.

2. 서버 보관 인증정보가 필요하면 실행할 요청과 인증정보 참조를 서비스 서버에 전달한다.

3. 서버용 실행기는 서비스의 인증정보 조회 기능으로 실제 값을 받아 요청에 넣고 대상 API를 호출한다. 비밀값은 클라이언트로 반환하지 않는다.

4. 대상 API 서버가 해당 인증 주체의 데이터·업무 권한을 검사하고 결과를 반환한다.

서버는 호출자의 인증정보 사용 권한과 그 인증정보를 붙일 목적지를 검증한다. 이는 개별 리소스의 업무 내용을 사전에 아는 것과 다르다. 클라이언트 리소스는 변조될 수 있으므로 그 안의 선언만으로 비밀정보 사용을 허가하지 않는다.

전달 필드·실행기·secret resolver는 [HTTP 전송 계약](spec/01-datasource-auth.md#http-전송-프로필과-현재-요청-dto), 오류는 [공통 오류](spec/07-host-integration.md#공통-오류와-진단)를 따른다. 다음 절의 과거 저장 원본 target 프로토콜을 새 기본 프로토콜로 사용한다는 뜻도 아니다.

### 6.3 대체된 실행 모델

저장 원본을 kind/id/path로 다시 찾는 방식은 과거안이며 공통 필수 프로토콜이 아니다. 현재 리소스 기반 실행이 우선한다. 서비스가 저장 원본 방식을 별도로 채택할 수 있지만 이를 필수 어댑터·사전 저장·revision 검증 의무로 확대하지 않는다. 현재 요청 DTO는 U13의 HttpExecutionPlan이다. [E15, E23]

### 6.4 서비스와 라이브러리의 책임

리소스가 요청·입력 연결·후속 동작을 선언하고, 라이브러리가 해석·의존성·실행 순서·요청 구성을 담당한다. 서비스는 리소스별 버튼·폼·Query를 미리 아는 전용 핸들러 대신 범용 연결을 제공한다. 서버 중계가 필요할 때 서비스와 서버용 실행기는 비밀정보 제공·안전한 인증 주입·요청 실행을 맡고, 대상 API 서버가 실제 데이터·업무 권한을 판단한다. 기본 기능으로 표현할 수 없는 새 업무/장비 기능에는 등록된 확장 구현이 필요할 수 있다. ‘모든 미래 기능을 무조건 코드 없이’라는 약속은 아니다. [E23]

비밀값은 클라이언트 리소스에 넣지 않는다. **현재 표기는 spec.secrets의 별칭 → 서버 비밀값 참조 선언과 @path: /secrets/별칭 사용으로 통일한다.** 이전 auth.secret·secretRef 표기는 현재 작성 형식이 아니다. Login으로 얻은 토큰도 서버 전용 /auth/token에서 읽는다. auth가 없어도 headers·params 등에서 비밀값을 사용하면 서버 평가·실행이 필요하다. 비밀정보 저장·암호화와 호출자별 사용 허용·허용 목적지 정책은 서비스를 통합하는 측이 책임진다. 대상 API는 전달된 인증 주체를 기준으로 권한을 검사하므로, 공용 관리자 인증정보가 사용자별 권한을 자동으로 대신 표현한다고 가정하지 않는다. [E28]

## 7 Action 실행과 이벤트 연결

**확정:** Action은 명시적으로 시작하는 실행이고 이벤트는 발생 사실이다. 코드형과 선언형 Action 모두 같은 `actionRef`·`inputs`로 호출한다. [E16, E41, E42]

- 이벤트는 발생 사실, Action은 수행할 동작이다.

- 이벤트에는 호출할 Action을 연결하고 실제 절차는 이름 있는 Action에 정의한다.

- Action은 Component 내부 또는 독립 재사용 정의로 둘 수 있다.

- 공개된 Action은 UI 이벤트, 부모, 서비스 코드, 에이전트에서 같은 실행 경로로 호출한다.

- `steps`는 순차 실행한다. 선택적 로컬 `id`를 붙인 성공 단계 결과를 뒤 단계에서 `/steps/id`로 참조한다. 미래 단계·없는 단계·실패 결과를 성공값처럼 참조하지 않는다.

- 단계 실패 시 뒤 단계를 중단한다. **이미 완료한 SetState와 외부 변경 모두 자동 롤백하지 않는다.** 순차 Action 전체를 코어 변경 묶음 하나로 간주하지 않으며 예외를 성공 결과로 가장하지 않는다. [E67]

- Value 입력은 호출 시점 스냅샷이며, State/Query 입력은 연결 대상의 정체성을 호출 시점에 포착한다. 실행 중 폼 편집이나 다른 연결로의 변경이 이미 시작한 호출의 입력을 몰래 바꾸지 않는다.

- `If.condition`은 strict boolean 값 표현식이며 `then`은 필수, `else`는 선택적 단계 배열이다. false이고 else가 없으면 작업 없이 다음 단계로 간다. 중첩 가능하며 분기 내부 단계 결과는 해당 분기 범위에 속한다. 조건 평가·분기 단계 실패는 Action을 중단하며 else는 catch가 아니다. If 자체를 결과 생성 단계로 쓰지 않는다. `Assert.condition`이 false이면 `message`를 포함한 오류로 중단하고 후속 단계·정상 output을 평가하지 않는다. message의 생략·동적 평가·오류는 U13의 Action 상세를 따른다. [단계 JSON과 범위](spec/04-action.md#if와-assert의-조건-계약)를 따른다. [E48]

- 이미 성공한 외부 API 변경은 후속 실패 때문에 자동 롤백되지 않는다.

### 7.1 1차 단계와 결과 계약

| kind | 역할 |
|---|---|
| Query | 재사용 queryRef 또는 인라인 spec을 명시 실행 |
| Action | 선언형 또는 코드형 actionRef, 혹은 인라인 선언형 spec 실행 |
| Variable | variableRef 또는 인라인 spec의 순수 계산 |
| SetState | target이 가리키는 기존 State 전체 값 교체 |
| RefreshQuery | target으로 연결된 기존 Query 사용 인스턴스를 현재 입력으로 새로 갱신하고 대기 |
| If | strict boolean 분기와 then/else 단계 배열 |
| Assert | 조건 불충족 시 오류로 실행 중단 |

Query/Action/Variable 단계는 각각의 xxxRef와 인라인 spec 중 정확히 하나만 갖고 inputs를 명시한다. EmitEvent 단계는 1차에서 제외한다. UI의 on 연결에서 부모 Component 이벤트를 전달하는 emit은 별개다. Toast/Navigate 등은 새 내장 kind가 아니라 등록한 코드 Action으로 제공할 수 있다.

RefreshQuery가 실행 조건 때문에 불가하면 이유를 전달하고 Action을 중단하며 후속 단계·정상 output을 평가하지 않는다. gate가 다시 열릴 때까지 호출을 무기한 기다리거나 건너뛴 성공으로 처리하지 않는다. active가 있으면 그 완료 뒤 fresh 요청을 실행하고 새 완료까지 기다린다. refresh:false 제외는 QUERY_REFRESH_DISABLED이며 복구 retry는 U13의 Query 상세를 따른다. [Query 실행 계약](spec/02-query.md#viewcomponent가-소유하는-query-사용-인스턴스)을 따른다. [E55]

**결과 계약:** 결과가 있는 Action은 spec.output에 schema 또는 typeRef 중 정확히 하나를 둔다. 선언형에는 output.value가 필수이며 코드형 계약에는 value를 두지 않고 구현 함수가 결과를 반환한다. /steps/id에는 검증한 실제 결과가 들어가며 output 설정 객체나 {value: ...}로 감싸지 않는다. false도 정상 결과다.

output 생략은 void다. 선언형의 마지막 단계 결과를 암묵 반환하지 않는다. 코드형은 undefined 또는 return 생략이어야 하며 output 없이 값을 반환하거나 output을 선언하고 undefined를 반환하면 계약 오류다. null은 허용 타입을 선언해야 하는 명시적 값이다. void 단계의 /steps/id 읽기는 참조 오류이며 null로 대체하지 않는다. 출력 평가·타입 검증 실패는 Action 실패이며 후속 단계로 가지 않는다.

### 7.2 실행 관찰과 수명

이벤트 Action 연결의 선택적 로컬 id로 /actions/id를 관찰한다. id가 없어도 연결별 실행 중 재호출 제한은 유지한다. 같은 View/Component owner 안에서 호출 연결의 관찰 id가 중복되면 오류이며, 슬롯의 실제 반복 투영으로 생긴 중복도 포함한다. 다른 Component 인스턴스의 동명은 별개다. 노드 ID·Action 정의 ID와 이 조회 별칭을 혼합하지 않는다. [E56]

status는 idle/running/success/error, running은 그 상태에서 파생한다. data/error는 읽기 전용이다. 실제 새 실행 시작 시 이전 data/error를 비우며 같은 연결이 실행 중이면 추가 호출을 무시한다. 큐나 자동 취소를 새로 만들지 않는다. 입력 평가·검증 실패는 단계 0개 실행·해당 연결 error/data:null이며, 오류에 원인과 문제 입력을 식별할 정보를 남긴다. DTO 필드·코드는 U13의 공통 오류를 따른다. [E57] UI 관찰용 data는 idle/running/실패 및 output 없는 성공에서 null이며 void 단계 참조의 의미를 바꾸지 않는다. 연결 등록 → idle/running:false/data:null/error:null 초기화 → UI 입력 평가 순서를 지키며 JSON 속성 순서에 의존하지 않는다.

**실제 on 호출 연결이 제거·폐기되거나 실행 소유 View/Component 인스턴스의 수명이 끝나면**, 해당 실행과 내부에서 호출한 하위 Action의 남은 단계 및 늦은 결과를 폐기한다. 코드형 구현에는 협력적 취소 신호를 전달하고, 호출에 묶인 State/Query 핸들은 이후 새 쓰기·refresh를 거절한다. 소유 View가 살아 있어도 호출 연결 자체를 제거하면 적용한다. 같은 로컬 id로 연결을 다시 만들어도 새 수명이며 이전 실행을 이어받지 않는다. 원래 공유 State/Query나 다른 호출의 핸들을 파괴하지 않는다. 일시적 가림·렌더러 분리는 폐기가 아니며 when:false에 의한 실제 제거는 폐기다. 이미 발생한 외부 효과의 취소·롤백을 보장하지 않는다. [E43, E42]

### 7.3 코드형 Action 확장

서비스가 직렬화 가능한 공개 계약과 실행 함수를 별도로 등록한다. Value 포트는 호출 스냅샷, State/Query 포트는 명시 연결된 대상 핸들을 받는다. core가 전체 View·StateStore·runtime을 자동 전달하지 않는다. 서비스 코드는 router나 알림 라이브러리를 클로저로 사용할 수 있는 신뢰된 코드이며 샌드박스가 아니다.

U35에서 코드 Action의 내부 호출은 부모 실행에 연결하기로 확정했다. 문맥의 `invokeAction`은 부모 취소·재귀 검사를 이어받으며 외부 runtime의 독립 호출과 구별한다. [하위 호출 상세](spec/04-action.md#재귀확장-실행의-경계)와 [최소 SDK 문맥](spec/07-host-integration.md#최소-sdk와-적용-완료)을 따른다.

취소는 협력적 정리이며 임의 코드를 강제 종료하거나 이미 저장한 서버 데이터를 되돌린다는 보장이 아니다. 정확한 등록 함수명·실행 인자·핸들 메서드·signal 이름은 구현 시 구체화한다. 코드 확장을 모든 독립 리소스에 자동 확대하지 않으며 Variable/transform의 기존 확장 요구도 없애지 않는다.

## 8 변경과 에이전트 연결

### 8.1 세 변경과 저장을 구분한다

상태 변경, 현재 화면 구성 변경, 재사용 리소스 정의 수정은 **모두 지원**한다. 원본 수정을 제외하기로 한 것이 아니다. 라이브러리는 변경·검증·변경된 정의 추출을 제공하고 실제 DB 저장과 기존 사용처 반영은 서비스가 맡는다. 자동 저장을 연결할 수는 있지만 라이브러리가 임의로 수행하지 않는다. [E17]

### 8.2 변경 묶음의 원자성

코어가 함께 관리하는 상태와 화면 구성은 변경 후 전체를 검증하고 한 번에 반영한다. 실패하면 해당 묶음을 적용하지 않는다. 적용 후 필요한 Query가 실행된다. 이후 Query 실패는 새 화면의 데이터 오류이지 구성 적용을 자동 취소한다는 뜻이 아니다. 외부 API·DB 저장·서비스의 별도 외부 Store까지 원자성을 보장하지 않는다. [E18]

### 8.3 정의의 자동 추종은 하지 않는다

실행할 때 주입된 정의를 사용한다. 저장소의 공용 Component·Query·Type이 바뀌어도 기존 화면이 몰래 최신 정의를 따라가지 않는다. 서비스의 명시적 재주입·업데이트 경로를 거친다. 이는 데이터 재조회/실시간 갱신을 막는 원칙이 아니다. 기존 setResource의 기본 동작인 이전 화면 소유 상태/URL 정리와 서비스 소유 상태 유지는 이미 정해졌다([이전 승인 의미의 이관](spec/09-preserved-contracts.md)). 이후 명시적으로 뒤로 미룬 것은 새 부분 변경·인스턴스 모델에서의 이행 및 진행 중 작업 처리 세부이지, 기존 기본 동작 전체가 아니다. [E19]

초기 적용은 준비된 UI부터 점진 표시하고 실행 가능한 최초 Query·화면 반영이 성공/개별 오류로 정리되면 완료한다. 외부 입력 대기는 오류/빈 데이터로 숨기지 않고 초기 완료를 막지 않는다. 구조·타입 충돌 같은 적용 자체 실패는 기존 화면·Store를 유지한다. 전부 inline/static인 화면은 서비스 조회/Query 콜백 없이 동작하며 실제 필요한 연결의 누락은 오류다. [초기 적용 관찰 상세](spec/09-preserved-contracts.md#초기-적용-완료의-확정-관찰-의미)를 새 SDK에 보존한다. 함수명·완료 핸들·Promise 시그니처는 별도 구체화다. [E61, E68]

### 8.4 에이전트 인터페이스는 라이브러리 공통 기반이다

라이브러리는 사용 가능한 리소스·기능·입출력 계약, 현재 View/인스턴스, 읽을 수 있는 상태, 호출 가능한 Action과 변경 결과를 조회·설명·조작하는 인터페이스를 제공한다. 서비스가 노출 범위와 권한을 정한다. 모든 리소스/원시 데이터를 LLM에 통째로 넣지 않고 필요한 정보를 조회하는 방향이다. 목록에서 보인다고 실행 권한이 생기지 않는다. [E20]

agent-kit과 SDK 어댑터는 이를 모델/SDK에 연결하는 구성 제안이다. A2UI/OpenUI 어댑터는 외부 UI 규격의 번역 계층이며, 에이전트 사용의 필수 관문이 아니다. 완전한 양방향 변환을 약속하지 않는다. 구체 패키지/API·전송 프로토콜은 남아 있다.

### 8.5 외부 앱 개발용 공통 스킬

외부 앱을 만드는 코딩 에이전트가 Viewstem 라이브러리를 사용할 수 있도록 공통 스킬을 구성한다. **현재 지원·검증 대상은 Codex이며 Claude Code는 첫 배포의 필수 조건에서 제외한다.** D129는 D119의 두 호스트 동시 첫 지원 조건을 대체한다. 라이브러리 계약·예제·작업 흐름은 특정 에이전트에 종속되지 않게 공유하고, 설치·발견·호출·도구 연결 등 실제 에이전트별 차이만 분리한다. 지원 완료는 실제 검증한 Codex 환경 범위로 표시한다. [현재 범위와 제거 기록](handoff/viewstem-skills-scope-2026-11-06.md), [D129](history/decision-register.md)

첫 지원 환경은 **로컬·클라우드 구분 없이 프로젝트 파일 접근과 Node.js 실행이 가능한 환경**이다. 파일·실행 도구가 없는 대화 환경을 위한 원격 계약 조회 경로는 첫 범위에 포함하지 않는다. [D120](history/decision-register.md)

라이브러리와 스킬은 **별도로 설치**한다. 라이브러리 설치가 스킬 설치나 에이전트 설정 변경을 자동으로 수행하지 않으며, 두 가지를 함께 준비하는 통합 설치 흐름은 제공 범위에 포함하지 않는다. [D121](history/decision-register.md)

최종 독립 리뷰의 보완을 [스킬 설계](../design_draft.md)와 [실행 계획](designs/viewstem-skills-implementation-2026-11-05.md)에 반영하고 최소 스킬 및 초기 비교 실험부터 구현했다. UI 조회 도구는 참조 자료만으로 남는 조회 실패·반복 비용이 관찰될 때 추가한다. D123 단계에서는 Claude Code를 준비만 했으며, 이후 D129에서 실행 검증을 중단하고 현재 지원 범위에서 제외했다. 준비 자료는 미검증 참고 자료로 보존한다. 공개 발행은 실제 검증과 배포 조건을 별도로 확인한다. [D123·D129](history/decision-register.md)

최소 공통 스킬과 Codex의 첫 View·폼·native UI 초기 비교를 완료했다. 최종 후보는 4파일 구성을 유지하며 추가 참조·조회 도구는 도입하지 않았다. 실제 통과 범위와 Claude Code의 준비·미실행 경계는 [초기 구현 인계](handoff/viewstem-skills-initial-2026-11-05.md)에 기록한다.

후속 Codex 확장 비교·비활성화 검사·B3 보완과 배포 판단은 [확장 검증 인계](handoff/viewstem-skills-extended-2026-11-05.md)를 따른다. 개발 산출물에서 재현된 [View 구독 후 투영 불일치](handoff/view-subscription-projection-2026-11-05.md)는 후속 [제품 수정·회귀·원본 앱 재검증](handoff/view-subscription-projection-fix-2026-11-06.md)에서 해결했다. 과거 스킬 비교의 실패 기록과 수정된 패키지의 검증 결과는 구별한다.

이는 실행 중인 화면의 원격 조작 프로토콜이나 새 agent-kit API, 공개 발행 승인을 뜻하지 않는다.

## 9 표현 언어와 혼선의 정정

### 9.1 CEL은 사용자 결정이 있었다

10월 16일 사용자: **“이해했어. 그러면 variable에는 cel spec을 이용하는 걸로 정하자.”** 따라서 Variable 계산에 CEL 명세를 쓴다는 결정을 이후 assistant가 ‘후보’라고 부른 것만으로 취소할 수 없다. [E21]

- CEL 언어 선택과 npm 실행기 선택은 별개다.

- @marcbachmann/cel-js, @bufbuild/cel은 검증 후보이지 최종 의존성이 아니다.

- native Set/Map·날짜·암묵 coercion 금지·입력 격리 등 기존 요구는 [이전 승인 의미의 이관](spec/09-preserved-contracts.md)대로 유지한다. Query 서비스 콜백 직전의 재귀 Set→배열·Map→쌍 배열 변환은 이미 확정됐다. 날짜의 공개 값·전송 문자열은 U14의 [값 상세](spec/10-value-contracts.md#날짜-값과-전송-형식)를 따른다. CEL 구현체와 JS·Dart의 동일 결과, 실행 비용 제한은 실제 검증이 필요하다. [E47, U14]

- 초기 compute 제안은 **expression으로 변경 승인**됐다. 현재 공통 리소스 외피 결정에 따라 위치는 `Variable.spec.expression`이다. 중간의 외피 평탄화 이력은 최신 결정으로 대체되며 CEL 선택과 expression 명칭은 유지한다. [E21, E27]

- Variable의 CEL 계산과 값 연결용 @path/@call은 서로 다른 역할이다. 둘을 하나의 미정 언어 선택으로 섞지 않는다.

### 9.2 값 표현도 명시적 선택 이력이 있다

`${inputs...}` 유지 → `${ports...}` 제안 → A2UI path/call 공통 사용 승인 → v1 Candidate의 **@path/@call**로 변경 승인 순서다. 마지막 두 변경은 사용자가 직접 지시했다. [E22]

```json
{
  "directValue": { "@path": "/ports/organizationId" },
  "displayText": {
    "@call": "formatString",
    "args": { "value": "조직: ${/ports/organizationId}" }
  }
}
```

이 조각은 마지막으로 승인된 값 표현 기준을 보여준다. directValue/displayText는 설명용 자리 이름이다. 단일 값 참조는 원래 값의 타입, formatString은 문자열을 만드는 역할이다. UI·Query·Datasource의 동적 필드에서 같은 표현을 쓰되 평가 가능한 데이터와 함수는 각 실행 문맥에 한정한다. HTTP 주소 request.path, 서버 실행 위치 target.path는 @path로 바꾸지 않는다.

이후 자체 공통 계약 중심으로 바꾼 것은 **A2UI 전체를 중심 프로토콜로 강제하지 않는 방향**이다. 그것만으로 이미 승인한 값 표현을 전부 폐기하지 않는다. 일반 데이터의 path/call 키는 표현식이 아니며, 동적 값 영역의 실제 @ 데이터 키에는 @@ escape를 사용하는 기본 의미를 유지한다. [값 상세](spec/10-value-contracts.md)에서 확정 의미와 남은 적용 위치·재귀/혼합 객체·잘못된 표현식 처리를 구별한다. null/삭제와 A2UI 전체 호환 여부도 별개다. [E54]

10월 26일 재확인으로 읽기와 쓰기 대상 모두 `{"@path":"..."}` 표현을 유지한다. 읽기는 값 평가, SetState.target에서는 쓰기 가능한 대상 해석이다. 같은 문법이 동일한 권한이나 모든 경로의 쓰기 가능성을 뜻하지 않는다. A2UI 전체 채택과 무관한 자체 표현 계약이다. [E31]

## 10 구현으로 넘어가는 기준

확정 계약을 변경·확장할 때 [적합성 안내](spec/08-readiness-conformance.md)와 [현재 작업 절차](handoff/implementation-start.md#새-채팅에서-시작할-때)를 적용한다. 공통 타입/검증 → State·값 → Query → Action → 화면 실행의 의존 관계를 유지하며 이미 구현한 core를 다시 착수 대상으로 취급하지 않는다.

U13의 스키마·오류·요청 DTO·최소 SDK, U14의 날짜·명시 업무 시간대·실패 후 성공 결과 보존·v1 선언형 Catch/Finally 제외, U35의 하위 호출 수명은 종료된 결정이다. 실제 지원과 통과 여부는 해당 구현의 타입·지원 문서·실행 증거로 확인한다.
