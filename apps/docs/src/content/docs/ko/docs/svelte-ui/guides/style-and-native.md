---
title: 스타일과 네이티브 Svelte 부품
description: 번들 테마를 적용하고 토큰을 바꾸거나 Svelte 부품을 직접 사용합니다.
sidebar:
  order: 3
---

## 번들 CSS 적용

브라우저 진입점에서 `@viewstem/svelte-ui/shadcn/styles.css`를 한 번 import하세요. 스타일시트에는 Vega 스타일과 Neutral 팔레트가 포함됩니다. 컴포넌트 규칙과 리셋은 키트의 `data-viewstem-shadcn` 요소와 그 내용에 적용됩니다. 호스트 Tailwind 빌드 없이 쓸 수 있습니다.

## 오버레이에도 테마 적용

다크 모드는 `html`에 `class="dark"` 또는 `data-theme="dark"`를 설정합니다. body로 포털되는 오버레이까지 토큰을 상속하려면 `html`이나 `body`에 토큰을 선언하세요. 내부 래퍼에 선언한 토큰은 그 래퍼의 자손에 적용됩니다.

부품이 `class` 입력을 받으면 `"toolbar-save"` 같은 클래스를 넘기고 호스트 스타일시트에 정의합니다. 번들에 없는 유틸리티 클래스가 필요하면 호스트 Tailwind 빌드를 사용하세요.

```css
:root {
  --viewstem-primary: #254fc6;
  --viewstem-primary-foreground: #fff;
}

:root[data-theme="dark"] {
  --viewstem-primary: #a6b8ff;
  --viewstem-primary-foreground: #17234c;
}

[data-viewstem-shadcn].toolbar-save {
  min-width: 8rem;
}
```

## Svelte에서 네이티브 Calendar 바인딩

패밀리 경로에서 `components` 네임스페이스를 가져옵니다. 이 예제에서는 앱의 직접 의존성에 `@internationalized/date`를 추가하세요. `Calendar.Calendar`는 네이티브 `DateValue`를 받습니다. JSON ID `shadcn.Calendar.Root`는 날짜 문자열을 받고 바뀐 값도 Viewstem에 전달할 형식으로 변환합니다.

```svelte
<script lang="ts">
  import { parseDate, type DateValue } from '@internationalized/date';
  import { components as Calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import '@viewstem/svelte-ui/shadcn/styles.css';

  let date = $state<DateValue | undefined>(parseDate('2026-11-03'));
</script>

<Calendar.Calendar type="single" bind:value={date} />
```

스코프가 있는 스니펫, 함수 prop, 참조, `FileList`, `bind:` 디렉티브는 네이티브 Svelte 부품에서 사용합니다. 날짜 부품은 [Calendar 레퍼런스](../../components/calendar/), 네이티브 툴팁은 [Chart 레퍼런스](../../components/chart/)를 참고하세요. View에서 호출할 사용자 정의 Svelte 코드는 [Svelte 어댑터로 등록](/ko/docs/svelte/adapters/)합니다.
