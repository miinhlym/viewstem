# UI 리소스 셋 제공과 사용 정책 · EGM 검토

## 결론

**UI 셋 작성은 기존 `defineResourceSet`으로 통일하고, 기본 스타일의 적용 대상은 `@viewstem/ui`가 관리한다.** 지금 소비자의 반복 작업은 셋 정의보다 CSS를 적용할 HTML 요소를 찾고 마커를 붙이는 데서 발생한다. `@viewstem/ui`는 현재도 일반 셋이며 DOM과 Svelte의 표시 경로에서 같은 DOM 바인딩을 사용한다. 따라서 패키지에서 스타일 범위를 바로잡으면 두 호스트를 함께 개선할 수 있다. [기본 셋](../../../packages/ui/src/index.ts) · [공통 표시 경로](../../../packages/svelte/src/lib/renderer.ts) · [검토 입력](review-target.md) · [독립 의견과 검증 근거](review-evidence.md)

추천하는 사용 형태다. 앱은 `ui` JS와 CSS를 각각 한 번 가져오며, 각 화면에 스타일 속성을 붙이는 작업을 줄인다. 현재 구현에는 스타일 범위를 자동으로 적용하는 부분이 필요하다.

```svelte
<script>
  import { ViewstemView } from '@viewstem/svelte';
  import { ui } from '@viewstem/ui';
  import '@viewstem/ui/styles.css';

  const source = {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: '저장' },
    },
  };
</script>

<ViewstemView {source} resourceSets={[ui]} />
```

같은 CSS를 가져온 DOM 앱에서는 일반 마운트 요소에 표시한다. 공유 Svelte 앱은 앱이 소유한 Registry에 같은 셋을 등록하고 `renderer`와 함께 `source` 또는 `view`를 전달한다. 스타일 결과는 등록 경로나 화면 소유 방식에 관계없이 같다.

## 왜 화면 전체에 속성을 붙이는 안이 부족한가

현재 CSS는 Basecoat의 루트·본문 규칙을 `data-viewstem-ui`로 옮기고, 스타일 적용 범위를 그 요소와 모든 자식으로 넓힌다. Svelte 표시 연결에는 이미 `display: contents`인 요소가 있어 속성 추가는 간단하다. 대신 그 아래의 커스텀 슬롯과 다른 UI 셋도 같은 리셋과 테마 변수를 받는다. UI 셋을 등록해도 현재 View에서 해당 구현을 사용하지 않을 수 있고, 한 View를 서로 다른 표시 위치에 붙일 수도 있다. [CSS 생성](../../../packages/ui/scripts/build-basecoat.mjs#L14) · [Svelte 표시 요소](../../../packages/svelte/src/lib/Display.svelte#L56) · [View 적용 계약](../../spec/12-resource-sets-browser.md)

Chromium에 현재 빌드된 `styles.css`를 넣고, `display: contents` 스타일 영역 안과 밖의 HTML 입력을 비교했다. 바깥 입력의 테두리는 `2px`, 영역 안의 호스트 입력은 `0px`였다. 같은 영역 안에서 `btn` 클래스를 가진 외부 버튼은 기본 UI 표식이 있는 버튼과 같은 계산 배경색과 `--primary` 값을 얻었다. 적용 영역을 옮기기만 하면 이런 영향도 함께 이동한다. 이 검증은 CSS 범위의 현행 동작을 재현했으며 제안한 구현은 만들지 않았다.

각 UI 루트에 지금 속성을 그대로 붙이는 방식도 충분하지 않다. 예를 들어 NativeSelect 스타일의 일부 규칙은 표식이 붙은 조상을 요구하므로 표식과 NativeSelect가 같은 요소면 매칭되지 않는다. Dialog와 Menu에서 빌린 자식 트리거는 포커스와 ARIA 등 기존 기능을 유지하면서 스타일 적용 여부를 별도로 판단해야 한다. `*.Portal`은 현재 같은 부모에 슬롯을 열고 내장 팝업은 브라우저 top layer를 사용한다. 임의의 다른 DOM 위치에 꽂는 제3자 슬롯은 별도 사례가 생겼을 때 다룬다. [NativeSelect CSS](../../../packages/ui/src/styles.css#L12) · [Portal 슬롯](../../../packages/ui/src/components.ts#L427) · [Menu 팝업](../../../packages/ui/src/menus.ts#L264)

## 공통 작성 정책

| 계약 | 작성자·소비자의 동작 |
| --- | --- |
| 정의와 합성 | 작성자는 `defineResourceSet()`에 안정적인 셋 ID·버전, 일반 리소스, 컴포넌트 계약과 바인딩을 넣는다. DOM은 DOM 바인딩, Svelte는 현행 `svelteComponent(contract, Component)`를 쓴다. 사용하는 UI 셋은 `dependencies`에 선언한다. JSON View는 등록된 Component ID를 참조한다. |
| 패키지 | 공개 JS 진입점에서 셋과 필요한 연결자를 내보낸다. 외부 스타일이 있는 패키지는 문서화한 CSS 진입점을 제공한다. 독립 작성자는 호스트와 Core 모듈을 공유하도록 peer dependency와 외부화를 사용한다. |
| 설치 | 앱은 사용할 최상위 셋을 한 번 등록한다. `dependencies: [ui]`인 셋을 전달하면 Registry가 `ui`를 함께 등록한다. CSS 파일이 필요한 경우 앱에서 한 번 가져온다. 리소스 의존성 선언과 번들러의 CSS import는 각각의 계약을 따른다. |
| 스타일 적용 | 패키지가 만든 DOM에 그 패키지의 기본 스타일을 적용한다. 고유한 클래스나 표식을 사용한다. 중첩 셀렉터의 최종 대상과 동적으로 만든 내부 요소까지 이 범위를 따른다. 새 기본 경로의 일반 리셋과 테마 토큰은 UI 소유 DOM에 한정한다. 커스텀 슬롯의 DOM에 직접 적용되는 리셋이나 클래스 충돌을 방지한다. 일반적인 CSS 상속과 명시적으로 공유하는 테마 변수는 별도로 설명한다. |
| 테마와 수명 | 표시된 컴포넌트가 자신의 DOM·팝업의 스타일을 책임진다. CSS 파일은 앱 자산으로 한 번 불러오고, 화면 해제는 그 화면이 만든 DOM만 정리한다. Registry에 셋만 등록해도 페이지 스타일이 바뀌는 경우를 피한다. 기존 `data-viewstem-ui`를 명시한 앱은 기존 범위와 테마 재정의를 호환 대상으로 삼는다. 마커를 지우고 새 기본 경로로 전환하면 외부 HTML에 적용되던 리셋과 배경 규칙이 달라질 수 있음을 안내한다. |

기존 외부 패키지 설치 테스트는 공개 API만 사용한 셋과 연결자를 독립 패키지로 설치하고, `ui` 의존성 및 Svelte 슬롯과 함께 렌더한다. 이 구조를 UI 셋 작성 가이드의 기본 예제로 재사용할 수 있다. 스타일 적용 개선과 제3자 연결자 동작을 같은 사례에서 검증할 수 있지만, 현재 테스트는 자동 스타일이 적용된다는 근거는 아니다. [외부 셋 설치](../../../packages/dom/test/public-consumer.test.mjs#L64) · [외부 셋 정의](../../../packages/dom/test/fixtures/public-consumer/external-set.ts) · [혼합 표시 테스트](../../../packages/dom/test/public-consumer.test.mjs#L147)

예를 들어 외부 작성자가 기본 UI에 의존하고 Svelte 배지를 추가할 수 있다. `badgeContract`는 `acme.StatusBadge`의 포트·슬롯·이벤트를 선언한다. 이 셋을 쓰는 Svelte 앱은 `resourceSets={[widgets]}`를 전달한다. 기본 UI의 CSS는 앱에서 함께 가져온다. 순수 DOM 호스트에서 이 배지도 쓰려면 기존 경로로 Svelte 연결자를 추가한다. 반대로 Svelte의 독립 화면은 기본 DOM·Svelte 연결자를 사용한다. 외부 셋이 별도 연결자를 요구할 때는 `createRenderer({ connectors })`로 만든 렌더러를 전달한다. [독립 화면 시작](../../../packages/svelte/src/lib/ViewstemView.svelte#L107) · [Svelte 렌더러](../../../packages/svelte/src/lib/renderer.ts#L112)

```ts
export const widgets = defineResourceSet({
  id: 'acme.widgets',
  version: '1',
  dependencies: [ui],
  components: [svelteComponent(badgeContract, StatusBadge)],
});
```

## 대안 비교

| 대안 | 얻는 것 | 비용과 제한 |
| --- | --- | --- |
| 기존 마커를 앱 레이아웃에서 한 번 적용 | 문서 변경으로 화면마다 반복하는 마커를 줄인다. | 전체 서브트리의 기존 리셋과 CSS 충돌은 이어진다. |
| UI 패키지가 소유 DOM과 CSS를 맞춤 | 앱의 스타일 마커를 없애고 UI가 쓰이는 모든 표시 방식에서 같은 결과를 얻는다. 다른 UI 셋도 독립 배포할 수 있다. | Basecoat 리셋·클래스·테마 변수와 보조 DOM을 점검해야 한다. 기존 마커를 각 컴포넌트에 반복 부착하는 방식은 슬롯 리셋이나 중첩 테마 문제를 남긴다. |
| 브라우저 레이어에 공통 화면 스타일 계약 추가 | 복수의 독립 패키지가 의도적으로 하나의 테마를 공유하거나, 표시 연결이 팝업 위치를 관리할 때 일관된 경계를 제공할 수 있다. | 화면 전체 영향과 소유권, 테마 우선순위, 표시 중 다시 적용하는 시점까지 계약해야 한다. 셋 ID나 Registry 등록을 기준으로 자동 활성화하면 실제 표시 경로와 어긋난다. |
| 별도 `Theme` 컴포넌트 또는 표시 옵션 | 화면 전체의 색·타이포그래피나 복수 테마를 앱이 제어할 수 있다. | 기본 사용의 래퍼를 유지하고 DOM 쪽 대응 API도 필요하다. 광범위한 테마 재정의를 원하는 소비자 경로에 적합하다. |
| 스타일을 포함한 브라우저 전용 진입점 | CSS import 한 줄을 줄일 수 있다. | CSS 선택자 문제는 따로 해결해야 한다. 브라우저 번들러, SSR과 Node import, CSS 교체나 생략의 동작을 별도로 보장해야 한다. 기본 `ui` import에 결합하기 전에 필요성을 확인한다. 현재 Node에서는 일반 `ui` import가 성공하고 CSS 진입점 직접 import는 `ERR_UNKNOWN_FILE_EXTENSION`으로 거절된다. |

Svelte의 컴포넌트 CSS는 기본적으로 자체 요소에 한정된다. DOM UI 작성자도 같은 소비 경험을 목표로 삼을 수 있다. Radix Themes는 앱에서 CSS를 한 번 가져오고 `Theme`에 넓은 스타일 정책을 맡긴다. 별도 포털은 그 범위를 벗어나므로 다시 테마를 전달한다. 명시적인 전체 테마를 구현할 때 참고할 사례다. Lit은 컴포넌트 구현이 자체 영역의 스타일을 소유하고 CSS 변수로 테마 설정을 노출한다. Viewstem에서 같은 책임 배분을 적용할 수 있으며, DOM·Svelte를 한 트리에서 섞는 현행 방식에서는 Shadow DOM 전환 비용도 별도로 고려해야 한다. AG Grid는 테마 삽입을 관리하면서 CSS 배치 위치를 따로 설정할 수 있게 한다. 일반화된 CSS 설치 기능을 추가할 경우 브라우저 문서·Shadow Root·수명까지 책임 범위에 들어간다. [Svelte 컴포넌트 스타일](https://svelte.dev/docs/svelte/svelte-files#style) · [Radix Themes 시작](https://www.radix-ui.com/themes/docs/overview/getting-started) · [Radix 포털 스타일](https://www.radix-ui.com/themes/docs/overview/styling) · [Lit 스타일](https://lit.dev/docs/components/styles/) · [AG Grid 테마 CSS 배치](https://www.ag-grid.com/javascript-data-grid/theming/)

## 먼저 확인할 수락 기준

1. **같은 기본 사용.** 마커 없는 Svelte 독립·공유·대여 화면과 DOM `mount`·`attach`에서 같은 기본 Button과 Card의 계산 스타일을 확인한다. `ui` 또는 그것에 의존하는 외부 셋을 등록하는 조합을 포함한다.
2. **혼합 화면 격리.** 화면 밖 버튼, 같은 View에서 나란히 보이는 직접 만든 Svelte 버튼과 Card 슬롯에 직접 투영한 외부 입력·`header`에 기본 UI 리셋이나 레이아웃이 직접 적용되지 않는다. 동일한 `.btn` 클래스를 쓴 외부 요소도 확인한다. 일반적인 CSS 상속과 문서화한 커스텀 스타일은 유지한다. UI가 등록된 상태에서 기본 UI를 전혀 사용하지 않는 화면도 포함한다.
3. **실제 카탈로그 조합.** 우선 Button과 Card, `slots.child`로 트리거를 받는 Menu나 Dialog로 경계를 검증한다. 공식 Button과 외부 Svelte 버튼 각각에서 포커스·키보드·ARIA를 확인한다. 전체 카탈로그로 확대할 때 NativeSelect, Grid 슬롯, Table의 의미와 직접 자식 구조를 확인한다. 내부 wrapper를 추가하는 해법은 역할·포커스·키보드·레이아웃에 영향을 주는지 함께 검사한다.
4. **테마·팝업·종료.** 밝기와 테마 변수 재정의, 팝업의 실제 부모 및 위에 표시되는 요소, 같은 View의 서로 다른 두 표시 연결, 한 화면만 제거할 때의 스타일을 확인한다. 기존 문서 데모의 명시적 테마 속성도 비교한다. [기존 테마 재정의](../../../apps/docs/src/styles/component-demo-theme.css) · [문서의 스크롤 보강](../../../apps/docs/src/components/site/ScrollEnhancements.astro#L8)
5. **외부 셋 배포.** 먼저 CSS가 있는 외부 작성자 패키지 하나를 공식 UI와 함께 설치하고, 각 CSS를 한 번 불러와 스타일의 직접 적용 범위가 겹치지 않는지 확인한다. 공통 스타일 API가 필요해지면 두 개 이상의 외부 패키지로 확대한다. Node에서 기존 순수 JS 진입점의 셋 import가 계속 동작하는지 함께 검사한다.

첫 변경의 범위는 `@viewstem/ui`가 소유한 스타일과 기존 셋 작성 가이드다. 여러 작성자가 공통 테마 경계나 팝업 위치를 기존 연결자로 표현하기 어렵다는 사례가 생길 때, DOM 표시 계층에서 공유할 기능의 모양을 정한다. Core·View JSON의 등록 모델은 현행을 기준으로 한다.
