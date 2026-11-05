---
title: "State 공유와 URL 동기화"
description: "호스트가 소유하는 State를 만들고 선택한 셀을 URL 어댑터와 동기화합니다."
sidebar:
  order: 2
---

호스트가 소유하는 State를 만들고 선택한 셀을 URL 어댑터와 동기화합니다.

## 셀을 만들고 어댑터 연결하기

Core 설치 후 아래 코드를 `.mjs` 파일로 실행하세요. 메모리 어댑터를 사용하므로 Node에서 실행할 수 있으며 브라우저를 이동시키지는 않습니다.

```js title="state-url.mjs"
import { createStateStore, mergeOwnedUrl } from '@viewstem/core';

const store = createStateStore();
const scope = store.createScope();
const filter = scope.registerState('filter', { schema: { type: 'string' }, initial: 'all' });
const selected = scope.registerState('selected', { schema: { type: 'string' }, initial: '' });
store.registerReaction(scope, { watch: [filter], target: selected, value: '' });
selected.write('row-1');
filter.write('active');
console.log(selected.read()); // ''

let href = 'https://example.test/customers?campaign=a%20b';
const listeners = new Set();
const adapter = {
  read: () => href,
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  writeOwned(patch, { isCurrent }) {
    if (!isCurrent()) return { applied: false };
    href = mergeOwnedUrl(href, patch);
  },
};
const connection = store.connectUrl({ adapter, bindings: [{ target: filter, key: 'filter' }] });
await connection.ready;
filter.write('archived');
console.log(JSON.parse(new URL(href).searchParams.get('filter'))); // archived
console.log(href.includes('campaign=a%20b')); // true
connection.dispose();
store.dispose();
```

필터를 바꾸면 선택한 행이 초기화됩니다. URL에는 JSON 문자열 `"archived"`가 인코딩된 필터 값으로 반영되고 무관한 campaign 파라미터의 원래 인코딩은 유지됩니다. listener 집합은 외부 URL 변경을 나타냅니다. `writeOwned` 외부에서 `href`를 바꿨다면 각 listener를 호출해 URL에서 State를 복원합니다.

## 브라우저 history 연결하기

브라우저 어댑터는 `location.href`를 읽고 `popstate`를 구독합니다. `mergeOwnedUrl(location.href, patch)` 결과를 `context.mode`에 따라 `history.pushState` 또는 `history.replaceState`로 적용하세요. 비동기 작업이 있다면 그 작업까지 끝난 뒤 실제 반영 직전에 `context.isCurrent()`를 확인해야 합니다. history 쓰기는 자동으로 `popstate`를 발생시키지 않습니다. 자신의 쓰기를 외부 탐색으로 다시 전달해 복원 루프를 만들지 마세요.

## View에 State 전달하기

`kind: 'State'` 포트를 선언하고 `createView({ inputs: { filter } })`에 발급받은 핸들을 전달합니다. View는 핸들을 사용하며 주입한 Store의 수명은 호스트가 책임집니다. 호스트 수명이 끝나면 URL 연결과 Store를 정리하세요. View 자체 State를 URL과 연결하려면 같은 Store에 두 번째 연결을 추가하지 말고 [ViewTarget](../../runtime/#viewtarget)의 `url` 편의 옵션을 사용합니다.

## 문제 해결

Store마다 활성 URL 연결은 하나입니다. 키·대상의 중복이나 지원하지 않는 스키마는 연결을 거절합니다. State가 missing·pending일 수 있다면 `getSnapshot()`으로 구분하세요. `write(undefined)`로 State를 비울 수 없습니다. 초기 기준값으로 돌리려면 `reset()`을 사용합니다.

트랜잭션은 [StateStore](../../state-store/), 지원 값·기본 키·크기 제한은 [URL](../../url/)에서 설명합니다.
