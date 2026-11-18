# @viewstem/dom

`@viewstem/core`의 `defineResourceSet`으로 컴포넌트 계약과 구현을 등록합니다. 바닐라 DOM 구현은 `DOM_CONNECTOR_ID`와 `DomComponent`를 사용합니다. `createRenderer({ runtime })`에 Runtime을 전달하고, 다른 연결자는 `connectors`로 추가합니다.

`renderer.mount({ target, source })`는 View를 소유합니다. `mounted.ready`는 View가 준비되고 표시 연결이 성립하면 View를 반환합니다. `mounted.whenRendered()`로 해당 연결의 렌더 완료를 확인합니다. 기존 View는 `renderer.attach(view, target)`으로 표시하고 `detach()`로 표시 연결을 해제합니다.

`fallback({ parent, anchor, node, error })`는 `parent` 안에서 `anchor` 앞에 정적 DOM을 넣을 수 있습니다. 렌더러는 fallback을 다시 그리거나 준비된 컴포넌트로 전환하기 전에 해당 범위를 비웁니다. 타이머 같은 자원을 정리하려면 `dispose()`가 있는 핸들을 반환하세요. 선택 메서드인 `update(context)`와 `whenRendered()`로 이미 표시한 fallback을 갱신하고 완료 시점을 알릴 수 있습니다.

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
