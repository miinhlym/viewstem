# 여러 UI 리소스 셋의 스타일 격리

- 작성 기준일 2026-11-19
- 작성자 miinhlym
- 상태 설계 제안

이 초안의 수동 CSS import 예시는 당시 제안이다. 현재 스타일 소유권과 브라우저 자동 로딩은 확정된 D169·D170을 따른다. [현행 스타일 계약](../../spec/12-resource-sets-browser.md#ui-셋의-스타일-소유권)

## 배경과 문제

한 View에서 `@viewstem/ui`의 Card 안에 외부 Svelte 입력을 넣을 수 있다. 앱이 현재 `styles.css`를 가져오고 상위에 `data-viewstem-ui`를 붙이면 외부 입력에도 Basecoat의 리셋이 적용된다. Chromium 재현에서는 같은 일반 입력이 범위 밖에서 테두리 `2px`, 범위 안에서 `0px`였다. [재현 근거](review-evidence.md) · [CSS 빌드](../../../packages/ui/scripts/build-basecoat.mjs#L14)

이 설계의 목표는 셋마다 별도 스타일시트를 가져오더라도 한 View와 한 슬롯 트리에서 각자의 기본 외형을 유지하는 것이다. 앞선 EGM 검토 결과를 토대로 사용 계약을 제안한다. [대안 검토](consolidated-review.md)

## 제안하는 사용 계약

| 역할 | 동작 |
| --- | --- |
| 앱 개발자 | 브라우저 진입점에서 사용하는 각 셋의 외부 CSS를 한 번 가져온다. 같은 View에 셋을 함께 전달한다. 기본 스타일을 위해 마운트 요소에 셋별 속성을 지정할 필요가 없다. |
| 셋 작성자 | 기존 `defineResourceSet()`으로 JS 셋과 의존성을 선언한다. DOM 스타일시트가 필요하면 CSS 진입점을 함께 제공하고, 그 셋이 만든 요소를 고유한 클래스나 내부 표식으로 구별한다. Svelte 구현은 컴포넌트 자체 CSS를 사용할 수 있다. |
| UI 패키지 | 스타일 규칙의 최종 대상이 자신이 소유한 요소인지 확인한다. 컴포넌트가 만든 컨트롤, 아이콘, 팝업 보조 DOM과 가상 요소도 포함한다. 슬롯에 들어온 외부 요소는 그 슬롯의 작성자가 스타일을 정한다. |
| 테마 제공자 | 색상과 반지름 등 공개된 셋별 변수를 호스트 CSS에서 재정의할 수 있다. 여러 셋이 같은 색을 써야 하면 호스트가 공통 값을 각 셋의 공개 변수에 명시적으로 연결한다. |

목표 사용 형태다. `@example/forms`는 예시 외부 패키지다. 외부 셋의 스타일과 셋 등록은 각각 공개 진입점을 사용한다.

```svelte
<script>
  import { ViewstemView } from '@viewstem/svelte';
  import { ui } from '@viewstem/ui';
  import { forms } from '@example/forms';
  import '@viewstem/ui/styles.css';
  import '@example/forms/styles.css';

  const source = {
    render: {
      id: 'settings',
      componentRef: 'shadcn.Card.Root',
      slots: { default: [
        { id: 'name', componentRef: 'example.forms.Input' },
      ] },
    },
  };
</script>

<ViewstemView {source} resourceSets={[ui, forms]} />
```

외부 셋이 `dependencies: [ui]`를 선언했다면 이 예제의 앱은 `forms` 하나를 전달해 두 셋을 등록할 수 있다. CSS는 앱 빌드가 불러오는 자산이다. DOM `mount`·`attach`와 Svelte의 독립·공유·대여 View에도 같은 스타일 규칙이 적용된다. [셋 등록과 View 수명](../../spec/12-resource-sets-browser.md#공통-저장소와-view-적용)

## 적용 범위를 판단하는 기준

- **최종 대상.** Viewstem Card의 배경·여백·슬롯 배치는 Card가 정한다. Card 안의 외부 입력, 같은 클래스 이름을 쓰는 외부 버튼, Card의 직접 자식인 외부 `header`는 Viewstem 스타일의 적용 대상에서 제외한다. 상위 요소에만 표식을 검사하는 중첩 규칙도 같은 기준으로 판단한다. [Basecoat 중첩 처리](../../../packages/ui/scripts/build-basecoat.mjs#L26)
- **소유권의 수명.** 같은 컴포넌트가 버튼을 링크로 교체하거나 메뉴 위치 요소를 나중에 만들면 새 DOM에도 스타일이 따라간다. 컴포넌트 제거 시 그 소유 DOM만 사라지고, 같은 스타일시트를 쓰는 다른 표시 연결은 계속 같은 외형을 갖는다. [현행 요소 교체](../../../packages/ui/src/components.ts#L417)
- **외부 트리거.** `slots.child`로 빌린 버튼은 자기 셋의 외형을 사용한다. 메뉴가 부여하는 역할·ARIA·키보드 동작은 유지한다. UI 패키지가 직접 만들거나 같은 셋에서 공급한 기본 트리거에는 기본 UI 스타일을 사용한다. [트리거 선택](../../../packages/ui/src/menus.ts#L108)
- **CSS 이름.** 셋이 정의하는 CSS 변수·애니메이션·레이어 이름에 셋 고유 접두사를 사용한다. 패키지 내부 이름과 앱이 재정의할 공개 변수는 구분한다. 각 셋이 이 규칙을 따를 때 상대 셋에 직접 적용되는 스타일을 막을 수 있다. 앱에서 작성한 일반 CSS와 브라우저 상속은 통상적인 CSS 규칙을 따른다.
- **테마 경계.** 밝기와 공개 테마 값은 표시 위치의 조상에서 정한다. 같은 View를 붙인 두 DOM 위치가 다른 테마를 쓸 수 있다. 셋 등록이나 열린 View의 Registry 스냅샷 개정은 DOM에 테마를 적용하는 계기가 되지 않는다.

예를 들어 Card의 직접 자식 `header`에 적용하는 규칙에도 부모와 최종 대상의 소유권을 표현할 수 있다. 아래 속성명은 내부 구현을 설명하기 위한 예시다.

```css
.card:where([data-vs-ui-owned]) > header:where([data-vs-ui-owned]) {
  display: grid;
}
```

## 목표와 검증 사례

| 상황 | 완료로 볼 조건 |
| --- | --- |
| 명시 속성 없이 기본 UI 사용 | 버튼·Card·입력이 따로 작성한 래퍼 없이 기본 외형을 갖는다. Svelte와 DOM에서 비교한다. |
| 서로 다른 셋을 같은 View에 로드 | 두 스타일시트를 모두 가져온 뒤에도 다른 셋의 `.btn`과 일반 입력·제목의 배경, 테두리, 여백에 직접 발생하는 변경이 없다. Card 바깥, Card 안의 슬롯, 방향을 바꿔 외부 레이아웃 안에 기본 UI를 넣는 경우를 검사한다. |
| 메뉴 또는 Dialog에 외부 버튼을 트리거로 전달 | 트리거의 외형이 유지되고 Tab·Escape·포커스 복원과 ARIA가 동작한다. 패키지가 만든 메뉴와 백드롭은 올바른 테마를 받는다. |
| 같은 View를 서로 다른 두 곳에 표시 | 밝기와 테마 값을 각 연결에서 따르며, 하나를 제거한 뒤에도 다른 연결의 스타일이 유지된다. |
| 기존 테마 화면 이행 | `.dark` 및 `data-theme="dark"`와 호스트의 테마 재정의가 의도한 결과를 낸다. 문서 데모와 스크롤 처리에서 기존 속성에 기대는 부분을 확인한다. [테마 데모](../../../apps/docs/src/styles/component-demo-theme.css) · [스크롤 처리](../../../apps/docs/src/components/site/ScrollEnhancements.astro#L7) |

변경 경계는 UI 패키지의 DOM·CSS와 작성자 가이드다. 기존 Core 등록 방식과 브라우저 연결자 계약을 기반으로 한다. 스타일시트의 로딩이나 팝업 수명을 처리하는 공통 공개 API는 독립 셋에 해당 요구가 있는지 확인한 뒤 검토한다.

## 아직 결정할 사항 · 기존 스타일 속성의 역할

| 선택지 | 소비자에게 보이는 동작 | 대가 |
| --- | --- | --- |
| 테마 범위로만 유지 | 기존 `data-viewstem-ui`도 명시적 테마 재정의 위치로 쓸 수 있다. 이 속성이 있는 곳에서도 기본 CSS는 셋 소유 요소에 한정한다. | 기존 마커에 의존해 일반 HTML의 배경, 테두리, 여백을 조정하던 앱은 자체 CSS로 옮겨야 한다. |
| 기존 전체 영역 스타일에 호환 경로 제공 | 기본 사용은 각 셋의 소유 요소로 좁힌다. 기존 전체 영역의 외형에 의존하는 앱은 별도로 지정한 호환 경로를 이용한다. | 호환 경로에서는 기존과 같은 서브트리 CSS 영향이 생긴다. 별도 CSS나 설정을 넘겨 받는 기간과 종료 조건이 필요하다. |

## 구현의 기준

- 기본 CSS의 스타일 대상은 셋 소유 요소다. `data-viewstem-ui`는 `--primary` 같은 이전 테마 값을 읽는 범위로 사용한다. 신규 화면은 `--viewstem-primary`처럼 접두사가 있는 공개 테마 값을 사용할 수 있다.
- DOM 작성자가 `createStyleScope(id)`로 요소를 만들고 같은 ID로 `scopeUiCss(id)`를 실행한다. 패키지를 위한 ID는 설정에서 한 번 정의해 양쪽에서 공유할 수 있다.
- UI의 라이브러리 내장 테마와 셀렉터를 변환한다. 트리 전체 리셋과 호스트 배경 설정은 앱의 CSS가 관리한다.
- DOM·Svelte와 외부 패키지를 설치한 Chromium 검증에서, Card 슬롯의 외부 버튼·입력·헤더에 기본 UI 규칙이 직접 적용되는지 검사한다. 기존 테마 범위와 여러 표시 연결의 해제도 검증한다.

[확정 계약](../../spec/12-resource-sets-browser.md#ui-셋의-스타일-소유권) · [혼합 셋 검증](../../../packages/ui/test/style-scope.test.mjs)
