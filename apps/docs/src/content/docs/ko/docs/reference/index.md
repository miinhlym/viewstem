---
title: 레퍼런스 안내
description: 개념을 익혔다면 해결하려는 작업은 패키지 가이드에서, 정확한 필드와 메서드 계약은 레퍼런스에서 찾으세요.
---

개념을 익혔다면 해결하려는 작업은 패키지 가이드에서, 정확한 필드와 메서드 계약은 레퍼런스에서 찾으세요.

| 문서 | 다루는 내용 |
|---|---|
| [DSL](../dsl/) | 리소스, 값 표현식, View·Component, State·포트, Query, Datasource, Action, 타입 |
| [@viewstem/core](../core/) | UI 없이 런타임 실행, 상태·URL 연결, HTTP·Action 사용 |
| [@viewstem/svelte](../svelte/) | View 마운트, Svelte 어댑터 작성, 연결 수명 관리 |
| [@viewstem/svelte-ui](../svelte-ui/) | 컴포넌트 등록, JSON 조합, 스타일·네이티브 Svelte 사용 |

패키지 메뉴는 개요 → 사용 가이드 → API 레퍼런스 순서입니다. API 페이지에서 시그니처, 옵션·기본값, 반환값, 오류와 수명을 설명합니다. Svelte UI의 [컴포넌트 목록](../svelte-ui/component-sets/)에서 66개 계열의 상세 페이지로 이동할 수 있습니다.

<a id="host-examples"></a>

## 호스트 앱 예제

실행 가능한 전체 코드는 [Core 런타임 가이드](../core/guides/runtime/)와 [Svelte 수명 관리 가이드](../svelte/guides/manage-view-lifecycle/)에서 확인하세요. 등록된 View를 실행하고, 실행 중인 정의를 갱신하고, 호스트 Action을 호출한 뒤 정리하는 흐름을 다룹니다.
