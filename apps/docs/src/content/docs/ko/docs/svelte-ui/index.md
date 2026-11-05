---
title: Svelte UI
description: shadcn 컴포넌트 세트를 등록하고 Viewstem에서 조합하는 방법입니다.
sidebar:
  order: 0
---

`@viewstem/svelte-ui`는 [Svelte 렌더러](/ko/docs/svelte/renderer/)에서 쓸 수 있는 shadcn-svelte UI를 제공합니다. 앱에 필요한 세트를 등록하고 View에서 컴포넌트 ID를 참조하세요. 원본 Svelte 부품을 호스트 컴포넌트에 직접 가져올 수도 있습니다.

## 가이드

- [컴포넌트 패밀리 등록](guides/register-families/)에서 필요한 세트를 가져와 첫 View를 마운트합니다.
- [JSON으로 컴포넌트 조합](guides/compose-json/)에서 입력, 슬롯, 이벤트 Action을 연결합니다.
- [스타일과 네이티브 Svelte 부품](guides/style-and-native/)에서 테마를 적용하고 스니펫과 바인딩을 사용합니다.

## 레퍼런스

- [등록 API와 `ComponentSet`](registration/)에서 패키지 루트 export를 확인합니다.
- [컴포넌트 세트](component-sets/)에서 각 공개 패밀리의 경로와 레퍼런스를 찾습니다.
- [지원 메타데이터와 스타일시트](support/)에서 두 정적 export, JSON 입력 스키마, 이벤트 페이로드를 확인합니다.

카탈로그에는 66개 패밀리와 386개 원본 Svelte 부품이 있습니다. 전체 세트를 등록하면 원본 부품 351개와 별도 JSON 조합 6개를 합쳐 Viewstem 컴포넌트 ID 357개를 사용할 수 있습니다. 나머지 원본 부품 35개는 네이티브 Svelte 문맥이 필요합니다.
