# UI 셋 정책 독립 검토와 실행 근거

제품 코드 대신 기존 동작과 대안을 적은 [검토 입력](review-target.md)을 사용했다. EGM 리뷰어는 각각 새 대화 문맥으로 시작했다. 이번 검토는 기능 설계와 대안 비교를 다뤘다. [종합 보고서](consolidated-review.md)

## 초기 전체 관점과 대안 탐색

- 이미 독립 npm 패키지의 공개 셋 정의와 Core peer 공유, 공식 UI 의존성, Svelte 슬롯 혼합이 가능하다. 먼저 같은 예제를 작성자용 가이드로 만들 수 있다. [설치 검증](../../../packages/dom/test/public-consumer.test.mjs#L64)
- 현재 스타일 속성을 UI에 붙일 때 조상과 대상이 같은 요소가 되는 규칙, 중첩 테마 변수 및 외부 슬롯의 리셋 적용 결과가 달라진다. DOM 구조와 CSS를 함께 검증한다. [NativeSelect 규칙](../../../packages/ui/src/styles.css#L12) · [Basecoat 범위](../../../packages/ui/scripts/build-basecoat.mjs#L14)
- 공통 브라우저 계약의 실익은 여러 독립 작성자가 같은 표시 수명에 CSS 설치·공유·해제를 맡기려는 경우다. 그 경우 실제 DOM 스타일 루트와 지원 포털의 범위를 먼저 정의해야 한다. [슬롯 호스트](../../../packages/dom/src/connection.ts#L184)
- 외부 회사가 자체 Svelte 컴포넌트를 공개할 때는 기본 Svelte 연결자가 사용된다. 새 연결자를 가진 별도 셋을 배포할 때는 호스트가 연결자를 주입해야 한다. 스타일 글루를 공통화해도 이 설치 차이는 남는다. [독립 View 생성](../../../packages/svelte/src/lib/ViewstemView.svelte#L107) · [연결자 주입](../../../packages/svelte/src/lib/renderer.ts#L112)

## 문서 단독 이해도

### 제안

외부 작성자가 계약·연결자·구현과 필요한 CSS를 패키지로 제공하고, 소비자가 DOM과 Svelte의 선언형 View에서 이를 쓴다. 스타일 범위를 패키지, 브라우저 표시 계층, 호스트 중 어디서 관리할지 검토한다. CSS 번들링을 단순화하는 진입점은 별도 선택이다.

### 문서에서 읽히는 현재 동작

제공자는 컴포넌트와 의존성을 `defineResourceSet`에 선언한다. 기본 `ui`는 DOM 바인딩과 CSS를 제공한다. 소비자는 Svelte 독립 화면에 셋을 넘기고 앱에서 CSS 및 범위를 준비한다. DOM과 공유·대여 표시에는 외부 등록 경로가 있다.

- **의존성 설치**. 외부 셋 하나가 `ui`를 의존할 때 소비자가 두 셋을 전달해야 하는지 문서에 드러나지 않았다. 종합 보고서에 셋 설치와 CSS import의 동작을 각각 명시했다.
- **영향 경계**. 사용하지 않는 등록 셋, Card 슬롯의 외부 컨트롤, 다른 위치에 표시되는 팝업에서 스타일 범위가 달라진다. 실제 표시와 UI 소유 요소를 기준으로 구체화했다.
- **수명**. 같은 셋을 표시하는 화면 두 개 중 하나를 해제할 때 셋 등록과 앱이 불러온 스타일은 유지되며, 해제한 화면이 만든 DOM을 정리하는 방식으로 설명했다.

## 구조 비판

- DOM 표시 대상에는 기존 DOM과 fallback이 있을 수 있다. 대상이나 전체 화면에 스타일 범위를 열면 다른 UI가 영향을 받고, 새 래퍼는 직접 자식과 입력·슬롯 구조를 바꾼다. [표시 연결](../../../packages/dom/src/connection.ts#L90)
- UI가 만든 위치 지정 요소, 다이얼로그·토스트·스크롤바의 동적 DOM, 버튼에서 링크로 바뀔 때 생성하는 요소도 스타일 대상이다. 빌린 `asChild` 슬롯에는 기존 포커스·ARIA 계약이 적용된다. 스타일 경계와 생성·교체·해제 검증에 반영했다. [UI 요소 수명](../../../packages/ui/src/components.ts#L417) · [동적 토스트](../../../packages/ui/src/behaviors.ts#L1053) · [빌린 트리거](../../../packages/ui/src/menus.ts#L108)
- 현재 UI의 `*.Portal`은 같은 부모에 슬롯을 제공한다. 내장 Dialog와 Menu는 DOM을 옮기지 않고 브라우저 top layer에 나타난다. 제3자 연결자가 제공하는 임의 슬롯 호스트에는 그와 다른 범위가 있을 수 있다. [Portal](../../../packages/ui/src/components.ts#L427) · [Menu](../../../packages/ui/src/menus.ts#L264)
- 기존 외부 패키지 혼합 fixture는 CSS를 포함하지 않고, 혼합 카운터는 기존 스타일 마커를 포함한다. 새 수락 기준에는 마커 없는 상태의 계산 스타일을 추가했다. [외부 fixture](../../../packages/dom/test/fixtures/public-consumer/main.ts) · [카운터 HTML](../../../packages/dom/test/fixtures/public-consumer/mixed-counter/index.html)

## 대안 재검토

- 비용이 가장 작은 대안은 앱의 공용 레이아웃에 기존 마커를 한 번 두는 것이다. 혼합 화면의 범위를 줄이고 마커를 생략하는 목표에는 패키지 소유 스타일이 더 적합하다. 제안의 기본 사용은 JS import와 CSS import를 각각 한 번 수행한다.
- CSS 빌드는 중첩 규칙을 조상 셀렉터에 위임한다. Card의 직접 자식 `header`가 외부 슬롯에서 왔어도 매칭될 수 있으므로 최종 대상에 관한 검증을 추가했다. 다이얼로그가 내부 생성한 닫기 버튼처럼 공개 컴포넌트 표식이 없는 요소도 포함한다. [중첩 규칙](../../../packages/ui/scripts/build-basecoat.mjs#L26) · [내장 닫기 버튼](../../../packages/ui/src/components.ts#L252)
- 기존 마커는 사이트의 테이블·코드 블록 스크롤 처리에서도 쓰인다. 마커를 빼는 문서 사례에 대해 그 동작을 확인할 필요가 있다. 기존 테마 호환과 `slots.child` 외부 트리거의 동작을 명시하고, 첫 외부 패키지 검증은 공식 UI와 외부 CSS 셋 하나를 섞는 범위로 좁혔다.

## 직접 실행

| 환경 | 확인한 동작 |
| --- | --- |
| Chromium과 현행 `@viewstem/ui` 빌드 CSS | `display: contents`인 표식 아래의 외부 `.btn`과 `data-vs-component="Button"`이 같은 배경과 테마 변수를 받았다. 그 안의 일반 `input`은 화면 밖 입력과 달리 테두리 `0px`, 안쪽 여백 `0px`였다. 브라우저가 계산한 스타일로 확인했다. |
| Node 24.22.2 | 브라우저 DOM 없이 `@viewstem/ui`의 `ui`를 import했다. 같은 실행에서 `@viewstem/ui/styles.css` 직접 import는 `ERR_UNKNOWN_FILE_EXTENSION`을 반환했다. |

이 결과는 스타일 범위와 순수 JS 진입점의 현재 동작으로 한정된다. 제안한 CSS 격리와 패키지 정책은 구현 후 별도 검증이 필요하다.
