---
title: "View 실행하고 관찰하기"
description: "화면을 그리지 않는 View를 만들고 State를 바꿔 출력 스냅샷을 관찰합니다."
sidebar:
  order: 1
---

화면을 그리지 않는 View를 만들고 State를 바꿔 출력 스냅샷을 관찰합니다.

## 준비하기

[설치](../../../installation/)에 따라 로컬 Core 패키지를 설치합니다. 소비 프로젝트에 다음 코드를 `run-view.mjs`로 저장하고 `node run-view.mjs`를 실행하세요. DOM이나 Svelte 컴포넌트는 필요하지 않습니다.

## 등록·실행·관찰하기

```js title="run-view.mjs"
import { createRegistry, createRuntime } from '@viewstem/core';

const registry = createRegistry();
registry.registerComponentContract({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
const runtime = createRuntime({ registry });
const view = await runtime.createView({
  states: { title: { kind: 'State', schema: { type: 'string' }, initial: 'Hello' } },
  render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/title' } } },
});
await view.whenSettled(view.initial);
console.log(view.getSnapshot().roots[0].inputs.text); // Hello
const observed = new Promise(resolve => {
  view.subscribe(snapshot => {
    if (snapshot.roots[0]?.inputs.text === 'Updated') resolve('Updated');
  });
});
view.getState('title').write('Updated');
console.log(await observed); // Updated
runtime.dispose();
```

컴포넌트 계약은 `Label`이 필수 문자열 입력을 받는다고 Core에 알립니다. 실제 UI 구현은 렌더러가 담당하며 이 예제에서는 출력 스냅샷을 읽습니다. `Hello`, `Updated` 로그를 통해 State가 노드 입력에 반영되는 것을 확인할 수 있습니다. `view.subscribe()`는 현재 스냅샷을 즉시 전달하고 구독 해제 함수를 반환합니다. 이 짧은 예제는 런타임을 폐기하면서 모든 구독을 정리합니다. 개별 관찰을 먼저 끝낼 때는 반환된 함수를 호출하세요.

## 실행 중 정의 바꾸기

`view.updateDefinition(nextSpec)`는 호환되는 State와 노드 수명을 유지하면서 현재 View를 변경합니다. `view.replace(nextSpec)`는 새 수명으로 시작하며 최신 레지스트리 정의를 주입합니다. 둘 다 적용 핸들을 반환하며 `view.whenSettled(application)`으로 보고를 기다립니다. `registry.updateResource()`만 호출해도 기존 View가 바뀌는 것은 아닙니다.

## 실패 원인 확인하기

- `REFERENCE_NOT_FOUND`: View를 만들기 전에 참조하는 계약과 리소스를 등록하세요.
- `TYPE_MISMATCH`: 입력값을 해당 포트·State 스키마와 비교하세요.
- `view.whenSettled(application)`이 `queryErrors`를 포함한 채 완료됨: 각 오류를 확인하세요. 완료는 모든 Query의 성공이나 DOM 표시 완료를 뜻하지 않습니다.

정확한 메서드와 소유권 규칙은 [Registry](../../registry/), [Runtime](../../runtime/), [View](../../view/)에서 확인할 수 있습니다.
