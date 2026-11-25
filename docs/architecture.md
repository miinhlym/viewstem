# Viewstem 구현 아키텍처

이 문서는 저장소의 구현 경계를 설명한다. 소비자가 사용하는 DSL과 API는 [공개 사이트](https://viewstem.miinhlym.workers.dev/docs/reference/)에서 찾을 수 있다. 언어에 종속되지 않는 확정 계약과 승인된 미출시 범위는 [제품 명세](VIEWSTEM-SPEC.md)와 [주제별 명세](spec/)가 관리한다.

| 영역 | 책임 | 구현 및 검증 |
| --- | --- | --- |
| Core | 정의 검증과 등록, State, Query와 Action 실행, View 노드의 수명. 호스트 화면이나 프레임워크에 의존하지 않는다. | [Core 구현](../packages/core/src), `npm run check` |
| 브라우저 렌더러 | View 노드의 표시 연결, 구현 호출, 슬롯 배치와 정리. 같은 Runtime의 View를 여러 연결에서 표시할 수 있다. | [DOM 구현](../packages/dom/src), [변경 범위별 검사](verification.md#choose-checks-by-change) |
| Svelte 연결 | Svelte의 표시와 수명을 브라우저 연결 계약에 맞춘다. 소비자가 등록한 구성요소를 사용한다. | [Svelte 구현](../packages/svelte/src/lib), `npm run check:svelte` |
| 기본 UI | 공통 JSON 컴포넌트와 스타일을 명시적으로 등록하는 셋으로 제공한다. 지원 목록과 사이트 카탈로그는 셋의 메타데이터를 따른다. | [UI 구현](../packages/ui/src), `npm run check:ui` |
| 호스트 | Runtime, router·Store의 수명과 기능 제공을 관리한다. 비밀 참조의 해석, 목적지 권한 및 서버 전송은 신뢰하는 호스트에서 다룬다. | [호스트 계약](spec/07-host-integration.md), [HTTP 권한 경계](spec/01-datasource-auth.md) |

DOM은 Core의 화면 실행을 브라우저에 표시한다. Svelte와 기본 UI는 각각 DOM의 연결 계약 위에 표시 구현을 제공한다. Core는 DOM·Svelte·UI 패키지에 의존하지 않는다.

## 등록과 렌더링

셋 등록은 전체 후보를 검증한 뒤 한 번에 공개한다. 실행 중인 View의 구성이 명시적으로 교체되는 시점과 각 표시 연결의 DOM 반영 시점은 별개다. 기존 수명을 재사용하는 경우에는 같은 정의와 구현이어야 한다. 늦은 이벤트나 비동기 완료가 이미 제거된 표시 연결이나 새 노드 수명에 반영되지 않도록 해야 한다. [리소스 셋과 연결 소유권](spec/12-resource-sets-browser.md)

Core가 관리하는 View와 노드의 수명을 DOM이나 Svelte 인스턴스의 수명으로 대체하지 않는다. 렌더러는 슬롯을 제공한 연결자와 그 슬롯의 자식을 연결하고, 필요하면 하위 표시 인스턴스만 다시 만든다. View 사용자가 의존하는 준비, 취소 및 실패 격리는 [공통 렌더링 안내](../apps/docs/src/content/docs/ko/docs/guides/runtime-and-rendering.md)에서 설명한다.

## 변경 위치

- 런타임 의미나 승인된 보장을 바꾸려면 [해당 제품 계약](VIEWSTEM-SPEC.md)과 적용 테스트를 갱신한다. 소비자가 볼 수 있는 변경은 공개 사이트 안내에도 반영한다.
- 사이트 자체의 탐색, 접근성, 예제 실행, Playground 동작은 [사이트 동작 계약](../apps/docs/README.ko.md#사이트-동작-계약)을 따른다. 패키지와 사이트의 공개 절차는 [릴리스 안내](releasing.md)가 관리한다.
- Dart 실행기와 선택 차트처럼 공개 npm 패키지에 포함되지 않은 범위의 기존 판단은 [후속 범위](follow-up.md#실제-남은-작업)와 [선택 차트 계약](spec/11-optional-charts.md)에서 확인한다.
