# @viewstem/dom

[English](README.md) | 한국어

`@viewstem/core`의 `defineResourceSet`으로 컴포넌트 계약과 구현을 등록합니다. 바닐라 DOM 구현은 `DOM_CONNECTOR_ID`와 `DomComponent`를 사용합니다. `createRenderer({ runtime })`에 Runtime을 전달하고, 다른 연결자는 `connectors`로 추가합니다.

`renderer.mount({ target, source })`는 View를 소유합니다. `mounted.ready`는 View가 준비되고 표시 연결이 성립하면 View를 반환합니다. `mounted.whenRendered()`로 해당 연결의 렌더 완료를 확인합니다. 기존 View는 `renderer.attach(view, target)`으로 표시하고 `detach()`로 표시 연결을 해제합니다.

`fallback({ parent, anchor, node, error })`는 `parent` 안에서 `anchor` 앞에 정적 DOM을 넣을 수 있습니다. 타이머 같은 자원을 정리하려면 `dispose()`가 있는 핸들을 반환하세요. 반환한 핸들에 `update(context)`가 없으면 노드의 상태나 오류가 바뀔 때 기존 핸들을 정리하고 fallback을 다시 만듭니다. 같은 자리에서 최신 스냅샷을 반영하려면 `update(context)`를 구현하세요. 선택 메서드인 `whenRendered()`는 완료 시점을 알립니다.

연결자는 `context.parent`에서 `context.anchor` 바로 앞에 DOM을 배치하고 `MountedComponent`를 반환합니다. `provideSlot`으로 슬롯 호스트를 등록하면 브라우저 렌더러가 자식의 배치와 이동·정리를 처리합니다. 반환된 철회 함수로 슬롯 등록을 해제합니다. 인스턴스나 갱신 신호가 취소되면 연결자 작업을 종료합니다.

동기 DOM 구현은 `update()`, `setPending()`, `dispose()`를 반환합니다.

```ts
import type { DomComponent } from '@viewstem/dom';

export const label: DomComponent = {
  mount({ parent, anchor, node }) {
    const element = parent.ownerDocument.createElement('span');
    element.textContent = String(node.inputs.label);
    parent.insertBefore(element, anchor);
    return {
      update(next) { element.textContent = String(next.inputs.label); },
      setPending(pending) { element.toggleAttribute('aria-busy', pending); },
      dispose() { element.remove(); },
    };
  },
};
```

연결자가 DOM을 비동기로 반영하면 `whenRendered(signal)`로 자체 DOM과 슬롯의 준비 완료를 알립니다. 렌더러는 그 결과를 기다린 뒤 그 시점까지 제공된 슬롯에 자식을 배치하고, `afterChildren`이 있으면 호출합니다. 표시 연결의 `whenRendered()`는 연결자와 슬롯 자식의 반영을 모두 기다립니다.

## 컴포넌트 셋의 스타일

CSS 빌드와 컴포넌트가 만드는 DOM에 같은 셋별 스타일 ID를 지정합니다. ID는 소문자로 시작하며 소문자·숫자·하이픈을 사용합니다.

```js
import { createStyleScope } from '@viewstem/dom/styles';

const forms = createStyleScope('acme-forms');
const input = forms.createElement(document, 'input');
```

자체 SVG에는 `createElementNS(document, namespace, tag)`를 사용합니다. 라이브러리가 해당 컴포넌트용으로 만든 요소는 `mark(element)`로 표시합니다. 호스트와 빌린 슬롯 요소는 자신의 범위를 유지합니다.

```js
import postcss from 'postcss';
import { scopeUiCss } from '@viewstem/dom/styles/postcss';

const result = await postcss([scopeUiCss('acme-forms')]).process(css, { from: 'styles.css' });
```

CSS import를 먼저 해결한 뒤 이 변환을 적용하고 결과 CSS를 배포합니다. 변환은 각 선택자의 최종 대상을 제한하고 내부 CSS 변수, 레이어, 애니메이션 이름에 접두사를 붙입니다. `.theme { .field { … } }`에서는 호스트나 다른 셋의 `.theme` 아래에 있는 자기 셋의 `.field`에도 스타일이 적용됩니다. `.theme` 자체의 선언은 자기 셋의 `.theme`에 적용됩니다. 앱이 이름으로 재정의할 변수는 `publicProperties`에 지정합니다.

변환기는 `@media`, `@supports`, `@container`, `@scope`, `@starting-style`, `@layer`, `@keyframes`, 비공개 변수의 `@property` 등록을 지원합니다. 최상위의 `@charset`, `@namespace` 지시문도 지원합니다. 빌드 도구의 지시문을 먼저 변환하세요. 그 밖의 `@` 규칙은 빌드 오류를 반환합니다.

`@font-face`와 `@counter-style` 같은 문서 전역 규칙은 호스트 스타일시트에 선언합니다. 공개 변수 등록과 문서 View Transition, 이름 있는 앵커 및 스크롤·뷰 타임라인의 이름 정의도 호스트가 맡습니다. 셋은 자신이 소유한 요소의 규칙에서 호스트가 제공한 글꼴, 카운터 스타일, 공개 테마 변수를 참조할 수 있습니다.

컴포넌트가 내부 변수를 JavaScript에서 갱신할 때는 `forms.localProperty('--progress')`를 `element.style.setProperty()`에 넘깁니다. 빌드가 CSS의 `--progress`에 붙이는 접두사와 같은 이름을 얻습니다.

스타일을 셋과 함께 번들링하려면 패키지의 `browser` 진입점에서 생성한 CSS를 가져오고 JS 진입점의 셋을 다시 내보냅니다. `exports`에서 `browser` 조건을 일반 JS 진입점보다 앞에 두고 브라우저 진입점과 CSS를 `sideEffects`에 넣습니다. 소비자는 셋을 그대로 등록할 수 있고, CSS를 직접 불러오는 호스트에는 별도 스타일시트 경로를 제공할 수 있습니다.
