# @viewstem/ui 설계 검토

2026-11-09 · Viewstem HEAD `225e7db` · EGM Stage 7 설계 비평 1회

앞선 채팅 제안을 [17행 스냅샷](review_input_snapshot.md)으로 고정했다. 설계·구조·문구 Goldfish 세 명이 부모 대화를 상속하지 않고 검토했고, 세 명 모두 최종 보고를 제출했다. 이 보고서는 발견 사항과 주 에이전트의 판단을 합친 결과다. 클라이언트 마운트 방식의 타당성을 검토했으며 구현 준비도, 브라우저 동작, 배포는 검증 범위 밖이다.

## shadcn의 어느 부분을 직접 만드는가

공식 shadcn의 `tsx: false`는 CLI에서 JavaScript 소스를 받는 설정이다. Dialog 같은 컴포넌트의 React 기반 구현은 그대로다. 현재 Viewstem 카탈로그는 별도로 고정한 shadcn-svelte의 Nova·Neutral 소스와 CSS를 사용한다. 스타일 토큰, 일부 마크업·변형 규칙, JSON 계약을 활용할 수 있다. 가져온 코드와 CSS는 실제 출처와 라이선스 고지를 함께 보존한다. [공식 shadcn JavaScript 안내](https://ui.shadcn.com/docs/javascript) · [공식 Dialog 구현](https://ui.shadcn.com/docs/components/base/dialog) · [현재 UI 원본과 CSS 빌드](../../../packages/svelte-ui/upstream/README.md) · [기존 출처 고지](../../../packages/svelte-ui/upstream/NOTICE.txt)

Viewstem의 직접 구현 범위는 **View 스냅샷 → DOM 반영, 슬롯·노드 수명 관리, DOM 이벤트 → Viewstem payload 변환, 카탈로그 등록**이다. Button·Card·Input·Checkbox는 네이티브 HTML에 기존 테마를 입히면 브라우저의 기본 폼과 키보드 동작을 활용할 수 있다. 기본 모달에는 `<dialog>.showModal()`이 포커스 이동, 배경 비활성화, Escape 처리의 출발점이 된다. 기존 Dialog가 노출하는 `slots.child`, 명시적 Portal, `openChangeComplete` 등은 각각 맞춰야 할 별도 계약이다. [W3C HTML dialog 기법](https://www.w3.org/WAI/WCAG22/Techniques/html/H102) · [현재 Svelte UI 계약](../../../packages/svelte-ui/README.md#json-inputs-slots-and-events)

## 대안과 선택 기준

| 대안 | 가져오는 것 | 남는 비용과 제약 |
| --- | --- | --- |
| 네이티브 DOM + 현재 Nova·Neutral | 기본 HTML 동작과 검토된 기존 스타일 | Viewstem 계약 연결과 CSS 범위 조정이 필요하다. 기본 부품에 우선 적용할 수 있다. |
| DOM + Basecoat | shadcn 계열의 Nova 스타일, HTML 구조, 일부 Vanilla JS 컴포넌트 | 별도 오픈소스 포트다. 스크립트는 문서 단위 자동 초기화와 자체 수명을 갖는다. CSS·마크업은 재사용 후보이며, 동작 전체 채택은 동일 요소 업데이트, 여러 마운트, 해제, 제어 값 이벤트 순서를 검증한 뒤 결정한다. |
| DOM + Zag Vanilla | 컴포넌트별 상태 머신과 Vanilla 어댑터를 통해 키보드, 포커스, 열림 등 복합 동작 재사용 | DOM 마크업, 스타일, 이벤트 매핑은 Viewstem이 연결한다. 머신과 Viewstem State 사이의 제어 값 흐름, 마운트·해제, 필요한 머신만 포함하는 소비 번들을 실험해야 한다. |
| 사전 빌드한 Svelte UI를 DOM API로 제공 | 현재 카탈로그 구현과 테스트를 가장 많이 재사용 | 소비자가 Svelte 앱을 만들 필요는 줄지만 내부 Svelte 런타임이 남는다. 프레임워크 런타임 독립을 제품 요건으로 해석하면 이 경로는 충족하지 못한다. |
| Custom Elements 또는 프레임워크별 어댑터 | HTML 태그나 프레임워크의 네이티브 합성 | Custom Elements도 내부 DOM 구현이 필요하고 등록·이동 수명이 추가된다. 프레임워크별 어댑터는 구현·릴리스 행렬이 늘어난다. 둘 다 공통 DOM 마운트 API 위에 별도로 평가할 수 있다. |

[Basecoat 소스 및 수명](https://github.com/hunvreus/basecoat#javascript-lifecycle) · [Basecoat 설치와 Nova 스타일](https://basecoatui.com/installation/) · [Zag Vanilla 릴리스](https://github.com/chakra-ui/zag/releases/tag/@zag-js/vanilla@1.47.0) · [Zag 어댑터 계약](https://www.zagjs.com/guides/framework-adapters) · [Custom Elements 수명](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)

**판정** — 먼저 기존 Nova·Neutral과 네이티브 HTML을 써서 Button·Card·Input·Checkbox와 기본 모달을 세로로 연결한다. 기존 스타일을 옮기는 비용이 크면 Basecoat Nova를 비교한다. 사용자 정의 Select나 Combobox가 필요할 때 Zag Vanilla를 작은 범위에서 검증한다. 기본 모달은 렌더러 검증 사례로 쓸 수 있지만, 기존 Dialog 전체와 호환된다는 공개 약속은 지원 부품과 동작이 확인된 뒤 별도로 한다.

## 발견 사항과 처리 제안

| ID | 우선순위 | 발견과 처리 제안 | 스냅샷 근거 |
| --- | --- | --- | --- |
| UI-01 | 차단 | 구현 선택의 근거가 빠졌다. 호스트가 프레임워크를 설치할 필요가 없는 조건과 번들 내부에도 프레임워크 런타임이 없는 조건을 구분한다. 이번 권고는 후자를 기준으로 한다. | 설계·구조·문구 / 5–13행 |
| UI-02 | 주요 | 공통 JSON 마운트와 개별 JS 컴포넌트 API가 섞여 있다. 첫 계약으로 공통 DOM 마운트, 명시적 컴포넌트 세트 등록, CSS import를 권고한다. JSON 외부에서 개별 부품을 직접 호출하는 사용 사례는 별도 범위로 표시한다. 같은 Registry에서 같은 ID를 다시 등록하는 경우도 계약으로 정한다. | 구조·문구 / 5–9행 |
| UI-03 | 차단 | 동일 ID만으로 기존 JSON이 동작하지 않는다. 현재 Dialog 계열은 열 개 ID와 제어 상태·트리거 합성·닫힘 정책을 제공한다. 지원 부품별 입력·기본값·슬롯·이벤트와 payload를 고정한 뒤, 기존 Svelte JSON을 양쪽 렌더러에서 실행해 검증한다. 같은 ID로 부분 지원할 경우 지원표와 거절 동작을 명시하고, 동작이 달라지는 설계에는 별도 ID를 검토한다. | 설계·구조·문구 / 11–17행 |
| UI-04 | 주요 | `subscribe`와 `emit`만 연결하면 비동기 투영 중 이전 DOM 이벤트, 입력·포커스 소실, 빌린 View의 수명 종료를 처리하기 어렵다. DOM 상태와 노드 세대를 함께 확인하고, 동일 노드 재배치 중 포커스·캐럿을 실제로 검증한다. 생성한 View와 빌린 View의 해제, DOM 반영 완료, 실패 전파, 리스너·오버레이 정리를 공개 계약에 넣는다. | 설계·구조·문구 / 7–9, 17행 |
| UI-05 | 주요 | CSS와 DOM의 범위가 정의되지 않았다. 컴파일된 CSS를 Viewstem 렌더링 영역에 제한하고, 테마가 오버레이에 적용되는 경로와 정리 책임을 명시한다. JSON 문자열은 텍스트로 처리하고 DOM 속성·URL 전달 범위를 정한다. | 구조·문구 / 7, 13–17행 |
| UI-06 | 주요 | 첫 발행과 후속 자동 발행의 조건이 다르다. 기존 스크립트는 버전 변경 전 manifest를 읽고 npm 404에서 중단한다. 패키지 도입과 최초 발행 순서를 분리하고, 빌드 결과를 tarball로 설치한 깨끗한 소비 프로젝트에서 JS·CSS export, 의존성, 마운트·해제를 확인한다. | 설계·구조·문구 / 15–17행 |
| UI-07 | 주요 | 중첩 코드 컴포넌트의 슬롯 노드가 core 스냅샷의 `children`과 `slots` 양쪽에서 재귀 직렬화된다. 소스상 반복 직렬화 비용이 깊이에 따라 커질 수 있다. DOM 렌더러는 둘을 중복 순회하지 않고, 중첩 깊이를 늘려 core 투영과 DOM 반영 비용을 분리해서 측정한다. | 설계 / 9, 17행 |

[Component 등록·슬롯·반복 계약](../../../docs/spec/05-component-view.md) · [호스트 통합·DOM 완료 계약](../../../docs/spec/07-host-integration.md) · [기존 렌더러의 현재 노드 검증](../../../packages/svelte/src/lib/connection.ts#L85) · [npm 릴리스 스크립트](../../../.github/scripts/npm-release.mjs#L31)

[Dialog 공개 지원표](../../../apps/docs/src/content/docs/docs/svelte-ui/components/dialog.md) · [HTML Dialog 수명](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) · [슬롯 평탄화](../../../packages/core/src/runtime.mjs#L250) · [스냅샷 직렬화](../../../packages/core/src/runtime.mjs#L396)
