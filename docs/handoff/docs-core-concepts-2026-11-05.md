# 공개 사이트 핵심 개념 문서 재구성

2026-11-05. 범위는 `apps/docs` 문서 메뉴의 핵심 개념, 개요에서의 진입, 관련 탐색이다. 홈·예제 갤러리·Playground 기능과 런타임 계약은 변경하지 않는다. 영문과 한국어에 같은 페이지 구조를 적용한다.

## 공식 문서 조사

상용 서비스나 기업의 지원 아래 운영되거나 실제 제품 개발에 널리 쓰이는 오픈소스 네 프로젝트를 비교했다. 유료 제품의 사용법을 Viewstem 계약으로 가져오는 조사는 아니다. 아래 URL의 실제 본문·메뉴를 확인했으며 원문 문장을 복제하지 않고 설명 구조를 적용한다.

| 프로젝트·확인한 페이지 | 페이지 분리와 읽는 순서 | 페이지 내부 표현 | 링크 사용과 적용 |
|---|---|---|---|
| [React: Describing the UI](https://react.dev/learn/describing-the-ui), [State](https://react.dev/learn/state-a-components-memory) | UI 구성과 상호작용을 큰 단계로 나누고 개별 개념 페이지를 둔다. State 페이지에서는 상태가 필요한 상황부터 시작한다. | 필요성 → 코드 → 동작 이유 → 주의점 → 요약·연습. 개념을 해당 페이지 안에서 설명한다. | 장 개요에는 하위 페이지 링크가 많지만 개별 개념 본문은 링크 목록으로 대체하지 않는다. 화면·값·상태부터 점진적으로 설명하는 순서를 적용한다. |
| [XState: XState](https://stately.ai/docs/xstate), [Context](https://stately.ai/docs/context) | 기본 모델과 State Machines 세부 항목을 분리한다. Context, Input, Events and transitions, Actions가 별도 메뉴다. | 짧은 정의와 최소 코드 다음에 초기화·입력·갱신을 구분한다. | 관련 용어는 문장 안에서 연결한다. State와 Action을 별도 페이지로 나누고 선언과 실행 결과를 함께 설명한다. |
| [TanStack Query: Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries), [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations) | 시작하기·가이드·API·예제가 분리되어 있다. 조회 기본형 뒤에 키·함수·조건·폴링 등의 심화 주제가 있다. | Query의 역할 → 최소 사용 예 → 상태와 결과 → 세부 동작. | 조회 설명 중 서버 변경을 다룰 때 Mutations를 연결한다. Viewstem도 Query 결과와 상태를 먼저 설명하되, 서버 변경은 기존 계약인 Action의 Query 단계로 설명한다. 별도 Mutation 리소스를 도입하지 않는다. |
| [JSON Forms: UI Schema](https://jsonforms.io/docs/uischema/), [Controls](https://jsonforms.io/docs/uischema/controls) | UI Schema 아래 Controls·Layouts·Rules가 별도 페이지다. | Controls는 정의 → JSON → 렌더링 결과 → 옵션별 설명으로 전개한다. | UI Schema 개요는 하위 링크 중심이지만 Controls 본문에는 코드와 결과가 있다. Viewstem에도 JSON의 위치와 예상 화면을 명시한다. |

## 기존 문서 판단

기존 핵심 개념 네 페이지는 문단 두세 개와 예제 링크 5~6개로 이루어져 있었다. 개념을 이해하려면 본문을 떠나 여러 예제를 열어야 했다. 개요용 링크 목록을 개념 설명 페이지에도 사용한 것이 문제이며, 링크 개수 자체가 보편적으로 잘못된 것은 아니다.

또한 개념 페이지의 `../../examples/…`는 실제로 `/ko/docs/examples/…` 또는 `/docs/examples/…`로 해석됐다. 실제 예제는 `/ko/examples/…`와 `/examples/…`에 있으므로 경로를 수정한다.

## 적용할 페이지와 설명 범위

| 순서·경로 (`docs/concepts/`) | 해당 페이지에서 끝낼 설명 | 코드·관찰 결과 | 참고한 구성 |
|---|---|---|---|
| 1 `view-and-component` | View 진입점, render 노드, componentRef·id·inputs, 슬롯으로 트리 구성 | 버튼 JSON → 표시 문구, 카드 슬롯 → 포함 관계 | React UI, JSON Forms Controls |
| 2 `values-and-inputs` | 리터럴·@path·@call, ports/inputs의 양쪽 역할, Value/State/Query 연결 구분 | 입력 title → 버튼 문구, concat → 문자열 | XState Input/Context, JSON Forms 필드 설명 |
| 3 `state` | State 선언·초기값·읽기·명시 쓰기, 초기화와 반응형 계산 차이, 인스턴스별 수명 | Draft → 호스트 쓰기 → Saved | React State, XState Context |
| 4 `derived-values` | Variable의 순수 계산, Derived의 반응형 사용, 명시적 입력과 CEL | title + ! → 입력 변경 시 재계산 | XState의 개념별 분리, React의 예제·결과 설명 |
| 5 `events-and-actions` | on·이벤트 입력, State 포트·SetState, 단계·결과·실패·실행 관찰 | 클릭 → Save Action → 같은 버튼 문구 변경 | XState Events/Actions 분리, React 상호작용 |
| 6 `queries-and-data` | Query 결과, sources/transform, Datasource와 HTTP, 상태·대기·오류, refresh와 명시 쓰기 | 상수 결과 → HTTP 응답 필드, 마지막 성공 데이터 의미 | TanStack Queries |
| 7 `conditions-and-lists` | when, repeat의 항목 범위·key, 제거와 수명 | 두 항목 중 조건을 만족하는 배지 표시 | React 조건·목록, JSON Forms Rules 분리 |
| 8 `component-composition` | Component 등록·재사용, 로컬 상태와 State 공유, 슬롯과 이벤트 경계 | 하나의 정의를 두 번 사용 → 별도 입력 | React 구성, JSON Forms JSON→결과 |
| 9 `resources-and-types` | 7종 리소스, kind/id/spec, 참조·인라인, Type 검증, 정의와 인스턴스·저장 구분 | 공용 Type → 두 포트의 동일 검증 | XState의 모델 설명, TanStack 가이드/API 구분 |

각 페이지는 짧은 정의, 필요한 맥락, 최소 코드, 결과와 의미, 해당 개념의 주요 경계 순으로 쓴다. 코드 조각은 View 전체인지, 등록 리소스인지, 기존 정의의 일부인지 구분한다. 실행용 UI 사전 등록은 첫 페이지에 설명한다. 예제 링크는 본문 학습 이후 대표 실습 하나를 제공한다. 페이지 간 읽기 순서는 좌측 메뉴와 하단 이전·다음 링크가 담당하며 본문에 같은 다음 단계 목록을 반복하지 않는다. 이 링크 방침은 관찰한 패턴을 적용한 편집 판단이며 다른 프로젝트의 공식 링크 개수 규칙이 아니다.

## 완료 기준

- 9개 개념 페이지와 메뉴·개요가 영·한 모두 일치한다.
- 설명에 필요한 JSON과 결과를 각 페이지 안에서 읽을 수 있다.
- 기존 두 경로는 새 문서로 리다이렉트한다.
- 사이트 빌드, 전체 문서 메뉴의 내부 링크·앵커, 새 JSON 예제의 런타임 실행을 확인한다.
- 데스크톱·모바일에서 메뉴·목차·이전/다음·언어 전환을 확인한다. 정적 빌드의 검색 색인도 확인한다.
- 검증 결과는 실행 후 아래에 기록한다. 배포는 이 작업의 범위가 아니다.

## 적용 및 실행 결과

- 영·한 각각 9개 페이지를 적용했다. 두 언어의 페이지 집합, 절 수, JSON, 대표 실습 연결이 일치한다. 시작하기·가이드·레퍼런스 메뉴는 유지했다.
- `state-and-actions` → `state`, `resources-and-ports` → `resources-and-types` 리다이렉트를 두 언어에 설정했다. 대표 두 한국어 이전 URL의 실제 브라우저 이동도 확인했다.
- `npm run build:docs` 통과. 이후 문서 간격 CSS와 repeat 설명만 수정하고 `npm exec -w @viewstem/docs -- astro build`로 최종 정적 빌드·Pagefind 색인 생성을 다시 확인했다. 기존 패키지 출력은 재사용했다.
- 정적 문서 메뉴의 HTML 38개(본문 34개와 이전 경로 리다이렉트 4개)에서 내부 링크·앵커 참조 1,264개를 전수 검사했고, 누락 페이지·앵커는 0개였다. 링크 개수는 같은 대상에 대한 반복 참조를 포함한다.
- 새 개념 문서의 JSON 블록 30개를 전부 파싱했다. 등록 리소스 4개를 해당 예제에 연결하고, 부분 표현식에는 본문에 명시한 문맥을 제공해 26개 시나리오를 현재 core 공개 API로 실행했다. 초기 표시, State 변경과 타입 거절, Derived 재계산, 클릭 Action과 관찰 상태, Query 결과 및 모의 HTTP 계획, 조건부 제거, 반복 필터, 재사용 Component, 두 Type 포트의 잘못된 값 거절을 확인했다. 이 검사는 최소 UI 계약을 등록한 런타임 검사이며 전체 shadcn 브라우저 테스트를 다시 실행했다는 뜻이 아니다.
- Ego Chromium에서 데스크톱과 390×844 모바일을 확인했다. 9개 메뉴와 선택 표시, 모바일 메뉴에서 Query 페이지 이동, 모바일 목차의 절 이동, 이전·다음 이동, 영문 전환, 정적 Pagefind의 `Derived` 검색 결과를 확인했다. 대표 View·값·Query 페이지에 문서 전체 가로 넘침이 없었다. 모든 페이지의 모든 뷰포트 조합을 시각 감사한 것은 아니다.
- 화면 확인 중 UI 테마 reset에 의해 문단·코드·표 사이 여백이 0이 되는 것을 확인해 `docs.css`의 본문 블록 간격을 보완했다. 최종 스크린샷과 계산 스타일에서 16px 간격을 확인했다.
- `git diff --check` 통과. 빌드에는 기존 markdown 설정 deprecation, 큰 번들 경고, 배포 `site` 미설정에 따른 sitemap 생략 경고가 남는다. 이 작업은 배포 주소나 번들 구조를 변경하지 않았다.
- 기존 개발 서버가 패키지 재빌드 이전 모듈을 유지해 SSR 로드 오류를 반환했다. 같은 프로젝트·포트의 Astro 개발 서버를 재시작하고 기존 `localhost:4321`의 개념 페이지 HTTP 200과 9개 메뉴를 확인했다. 공개 배포·커밋은 수행하지 않았다.

검증 도중 Starlight 0.39.3의 모바일 메뉴는 실제 열림 상태를 custom element와 body에 반영하지만 내부 button의 `aria-expanded`는 초기값을 유지하는 기존 동작도 관찰했다. 메뉴 표시·이동 검사는 통과했으며, 접근성 속성의 상류 수정이나 별도 컴포넌트 교체는 이번 문서 재구성에 포함하지 않았다.
