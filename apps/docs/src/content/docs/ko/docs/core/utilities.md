---
title: "Grid 배치 유틸리티"
description: "Grid 컴포넌트를 등록하거나 그리지 않고 렌더러가 사용할 12열 배치를 계산합니다."
sidebar:
  order: 17
---

Grid 컴포넌트를 등록하거나 그리지 않고 렌더러가 사용할 12열 배치를 계산합니다.

## computeGridLayout

```ts
computeGridLayout<A>(
  declarations: readonly { id: string; repeat?: unknown }[],
  expanded: readonly { id: string; address: A }[],
  layout?: Readonly<Record<string, GridConfig>>,
): Map<A, GridPlacement>;
```

`declarations`는 선언한 자식 노드, `expanded`는 현재 표시·확장된 인스턴스를 렌더링 순서로 담습니다. 반복 선언 하나가 여러 주소를 만들 수 있습니다. `layout`은 선언 ID별 배치 설정이며 기본값은 `{}`입니다. 반환 Map의 키는 확장된 인스턴스의 주소입니다.

| GridConfig 필드 | 기본값 / 제약 |
|---|---|
| `row`, `column` | 둘 다 생략하면 흐름 배치, 고정 배치라면 양의 안전 정수로 둘 다 지정합니다. 열은 1–12입니다. |
| `rowSpan` | 1; 양의 안전 정수 |
| `columnSpan` | 12; 최대 12인 양의 안전 정수 |

`GridPlacement`는 항상 `row`, `column`, `rowSpan`, `columnSpan`을 가집니다. 고정 사각형을 먼저 예약하고 확장 순서대로 흐름 항목을 앞쪽부터 빈 사각형에 배치합니다. 숨겨진 선언도 설정을 검증하지만 공간은 차지하지 않습니다.

```js title="grid-layout.mjs"
import { computeGridLayout } from '@viewstem/core';
const placements = computeGridLayout(
  [{ id: 'left' }, { id: 'right' }],
  [{ id: 'left', address: 'left-1' }, { id: 'right', address: 'right-1' }],
  { left: { columnSpan: 6 }, right: { columnSpan: 6 } },
);
console.log(placements.get('right-1')); // { rowSpan: 1, columnSpan: 6, row: 1, column: 7 }
```

없는 layout ID·부분 고정 좌표·범위 밖 span·중첩·반복 선언의 고정 좌표는 `INVALID_DEFINITION`입니다. 고정 항목을 조용히 이동시키지 않고 겹침을 거절합니다. CSS·DOM·드래그·내용 높이 측정은 제공하지 않습니다. 결과를 실제 배치에 반영하려면 [Svelte 어댑터](../../svelte/adapters/)를 구현하세요. 다른 루트 유틸리티는 [mergeOwnedUrl](../url/#mergeownedurlhref-patch)을 참고하세요.
