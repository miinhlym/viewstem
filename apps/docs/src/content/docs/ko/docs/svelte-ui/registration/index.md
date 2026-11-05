---
title: 등록 API
description: 패키지 루트의 registerComponents 함수와 ComponentSet 타입을 설명합니다.
sidebar:
  order: 4
---

`@viewstem/svelte-ui`에서 `registerComponents`와 `ComponentSet`을 가져옵니다.

```ts
import type { ComponentRegistration, Renderer } from '@viewstem/svelte';

interface ComponentSet {
  readonly id: string;
  readonly components: readonly ComponentRegistration[];
}

declare function registerComponents(renderer: Renderer, sets: readonly ComponentSet[]): void;
```

## `registerComponents(renderer, sets)`

주어진 세트의 등록 항목을 한 배열로 모아 렌더러의 일괄 등록 메서드를 한 번 호출합니다. 각 항목에는 Component 리소스 계약과 Svelte 어댑터가 들어 있습니다. 반환값은 `void`입니다. 세트 형식, 계약 또는 어댑터가 잘못됐거나 Component ID가 충돌하거나 렌더러가 이미 정리됐다면 예외가 발생합니다. 검증이 실패한 배치는 등록되지 않습니다.

View가 마운트할 때 정의를 캡처하기 전에 필요한 ID를 등록하세요. 세트를 가져오면 메타데이터에 접근할 수 있습니다. View에서 ID를 렌더링하려면 그 View의 렌더러에 세트를 등록합니다.

## `ComponentSet`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `id` | `string` | 세트 이름입니다. 내장 세트는 `shadcn/<family>` 형식입니다. |
| `components` | `readonly ComponentRegistration[]` | 등록할 항목입니다. 각 항목에는 `contract`와 `component`가 들어 있습니다. |

컴포넌트 ID는 각 항목의 `contract.id`에서 가져옵니다. 세트 ID는 컴포넌트 ID를 그대로 두므로 앱에서 쓰는 이름으로 등록 항목을 묶을 수 있습니다.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents, type ComponentSet } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';

const settings: ComponentSet = {
  id: 'settings-ui',
  components: [...button.components, ...dialog.components],
};

const renderer = createRenderer();
registerComponents(renderer, [settings]);
```

개별 어댑터 정의와 렌더러 등록 메서드는 [Svelte 어댑터](/ko/docs/svelte/adapters/)와 [렌더러 API](/ko/docs/svelte/renderer/)를 참고하세요.
