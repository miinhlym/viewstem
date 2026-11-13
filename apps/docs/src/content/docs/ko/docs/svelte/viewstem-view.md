---
title: ViewstemView
description: 기존 Svelte 트리에서 View를 만들거나 빌려 렌더링합니다.
sidebar:
  order: 4
---

## ViewstemView

`@viewstem/svelte`에서 가져와 `renderer`와 `source` 또는 `view` 중 하나를 전달합니다. 두 방식 모두 부모 Svelte context를 상속합니다. [마운트 가이드](../guides/mount-in-svelte/)에 실행 예제가 있습니다.

```svelte
<ViewstemView {renderer} source={{ ref: 'settings' }} inputs={{ accountId }} />
<ViewstemView {renderer} view={sharedView} />
```

## ViewstemViewProps

`ViewstemViewProps`는 기존 대여 prop 인터페이스입니다. `ViewstemSourceProps`는 생성 prop을 제공하며 `ViewstemViewComponentProps`와 `ComponentProps<typeof ViewstemView>`는 두 형태를 모두 포함합니다.

`view`와 `source`를 함께 전달하거나 둘 다 생략하면 `INVALID_DEFINITION`입니다. 두 경로에서 `onError`는 렌더러 관찰자에 화면 관찰자를 추가하며, `fallback`은 개별 노드 오류를 표시합니다.

## source로 View 만들기

브라우저에서 마운트된 뒤 View 생성을 시작합니다. 서버와 hydration 직전에는 빈 영역입니다. `source`는 인라인 `ViewSpec` 또는 `{ ref }`입니다. Svelte의 `$state`로 만든 인라인 정의도 전달할 수 있습니다.

컴포넌트가 초기화될 때의 `renderer`, `source`, `inputs`를 캡처하고, 브라우저 마운트 뒤 그 값으로 생성합니다. 이후 `source`나 `inputs`가 바뀌어도 현재 View를 유지합니다. 새 화면을 만들거나 소유 방식 또는 소유 렌더러를 바꾸려면 `{#key}`로 컴포넌트를 다시 만드세요.

준비 중에는 `pending` 스니펫을, 실패하면 `prepareError(error)` 스니펫을 표시할 수 있습니다. 준비 실패는 `onError`에 `prepare` 진단으로 전달됩니다. 컴포넌트를 제거하거나 렌더러를 폐기하면 준비를 취소하고 생성한 View를 폐기합니다. 공유 렌더러와 주입 Runtime의 수명은 호스트가 관리합니다.

Query가 요청 실행기에 도달하기 전에 닫으면 요청을 시작하지 않습니다. 이미 시작한 요청에는 중단 신호를 보냅니다. 정상 취소는 진행 중인 대기를 끝내며 `prepareError`와 `onError`를 호출하지 않습니다.

## whenRendered

`bind:this`로 얻은 인스턴스에서 `whenRendered()`는 DOM 반영을 기다립니다. `source` 준비 중에 호출하면 생성과 첫 DOM 반영을 기다립니다. 준비 실패는 해당 공개 오류로, 정리는 `CANCELLED`로 거절됩니다. 노드 렌더 오류는 이후 투영에서 복구할 수 있습니다.

초기 Query 보고나 View 직접 제어가 필요하면 호스트가 View를 만들고 전달합니다. 인스턴스에서 `whenSettled(view.initial)`을 호출하면 Query 보고와 DOM 반영을 기다립니다. 기존 연결에서 시작한 대기는 연결을 교체하거나 닫으면 `CANCELLED`로 거절됩니다. `view`를 교체한 뒤에는 새 View의 적용 토큰을 전달하세요. 다른 View의 토큰은 `INVALID_DEFINITION`입니다. 닫힌 연결에서는 이전 성공 보고도 다시 읽을 수 없습니다.

<a id="borrowing-a-view"></a>

## 기존 View 빌리기

빌린 `view`나 `renderer`가 바뀌면 연결을 교체합니다. 컴포넌트 제거는 연결과 구독을 해제하며 View와 주입 Runtime은 호스트가 폐기합니다.

View와 렌더러가 같은 Runtime을 사용하면 동일한 Registry를 참조합니다. 호스트가 소유한 Runtime을 공유하려면 `createRenderer({ runtime })`으로 렌더러를 생성하세요.

다른 Runtime의 View라면 참조하는 각 Component ID의 코드형 또는 선언형 종류가 두 Registry에서 일치해야 합니다. 코드형 Component마다 같은 공개 계약과 Svelte 구현을 등록하세요. 렌더러는 자체 Registry와 어댑터 등록을 사용하며 두 Registry의 호환성 검증은 호스트가 담당합니다.

같은 규칙이 [`renderer.attach`](../renderer/#attach)에도 적용됩니다. Svelte 앱의 자식 컴포넌트로 렌더링하려면 `ViewstemView`를, DOM 요소에 렌더러가 관리하는 루트를 만들려면 `attach`를 사용하세요.

[오류와 폴백](../errors/)에서 앱 루트 오류 정책을 확인할 수 있습니다.
