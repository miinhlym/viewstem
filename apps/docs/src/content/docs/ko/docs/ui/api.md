---
title: 브라우저 UI API
description: 카탈로그 등록, 기존 View 연결, 스타일과 지원 메타데이터 import를 설명합니다.
---

`@viewstem/ui`의 `ui` 셋을 `runtime.registry.registerResourceSet(ui)`로 등록하고 View를 생성합니다. `@viewstem/dom`의 `createRenderer`에 `{ runtime }`을 전달합니다. 마운트 대상에 `data-viewstem-ui`를 지정하면 스타일이 적용됩니다. 리소스 ID가 충돌하면 기존 Registry가 유지됩니다.

## 새 View 마운트

`renderer.mount({ target, source, inputs?, url?, onError? })`는 화면 핸들을 즉시 반환합니다.

| 대기 | 결과 |
|---|---|
| `await screen.ready` | View 준비와 표시 연결 성립 뒤의 View |
| `await screen.whenRendered()` | 첫 렌더나 State 갱신에 따른 해당 표시 연결의 DOM 반영 |
| `await screen.whenSettled(application)` | 해당 적용의 최초 Query 보고와 표시 연결의 DOM 반영. `queryErrors`를 확인합니다. |

최초 적용은 `view.initial`로 관찰합니다. 이후에는 `setInputs()`, `updateDefinition()`, `applyResourceSets()`, `replace()`가 반환한 적용 핸들을 사용합니다. [View 연산](../../core/view/)을 참고하세요.

`await screen.unmount()`는 준비 중인 작업을 취소하고 소유 View와 DOM의 정리를 기다립니다. Query가 요청 실행기에 도달하기 전에 닫으면 요청을 시작하지 않습니다. 이미 시작한 요청에는 중단 신호를 보내고 늦게 도착한 결과는 폐기합니다.

<a id="attach"></a>

## 기존 View 대여 연결

`renderer.attach(view, target, { onError }?)`는 `whenRendered()`, `whenSettled(application)`, `detach()`가 있는 연결을 반환합니다. `await attachment.detach()`는 DOM과 구독을 정리합니다. 빌린 View는 소유자가 폐기합니다.

두 경로 모두 문서에 연결된 미예약 HTML 요소가 필요합니다. 정리가 끝난 뒤 대상을 재사용하세요. `await renderer.dispose()`는 렌더러가 만든 화면과 대여 연결을 정리합니다. Runtime은 호스트가 `runtime.dispose()`로 정리합니다.

## 오류와 진단

| 상황 | 확인할 위치 |
| --- | --- |
| 대상이 없거나 연결되지 않았거나 이미 예약됨 | `mount()` 또는 `attach()`의 동기 예외 |
| View 준비 실패 | `screen.ready`가 정리 후 거절하고 `onError`에서 `prepare` 진단을 받습니다. |
| 컴포넌트 렌더 실패 | 해당 표시 연결의 `whenRendered()`가 거절하고 `onError`에서 `render` 진단을 받습니다. |
| 이후 노드·Query·UI 이벤트 Action·URL·렌더 오류 | `onError` 진단. 최초 Query 실패는 `whenSettled()`의 `queryErrors`에도 기록 |
| 직접 실행한 `view.invokeAction()` 또는 View 변경 실패 | 해당 호출의 Promise 거절 |
| 정리나 새 적용으로 완료 대기가 취소됨 | 대기 Promise가 `CANCELLED`로 거절 |

`onError`는 `{ phase, error, nodeId?, application? }`을 받습니다. `phase`는 `prepare`, `node`, `query`, `action`, `url`, `render` 중 하나입니다. 리터럴 Component 입력이 스키마 검증에 실패하면 `error.input`에 포트 이름이, Component 참조가 있으면 `error.resource`에 해당 Component가 기록됩니다. 렌더러 콜백이 화면 또는 연결 콜백보다 먼저 호출됩니다. 여러 연결이 같은 View를 관찰하더라도 같은 함수는 한 진단 발생을 한 번 받습니다.

## 스타일과 메타데이터

| Import 경로 | 내용 |
|---|---|
| `@viewstem/ui/styles.css` | 렌더러 영역에 적용되는 Basecoat Vega 스타일과 Neutral 팔레트 |
| `@viewstem/ui/support.json` | 컴포넌트 ID별로 지원하는 입력 포트, 슬롯, 이벤트 |

브라우저 진입점에서 스타일시트를 import하세요. 어두운 팔레트는 마운트 컨테이너의 조상 요소에 `.dark` 클래스나 `data-theme="dark"` 속성을 지정해 적용합니다. 메타데이터 구조와 카탈로그의 지원 범위는 [컴포넌트와 JSON 지원](../components/)에서 확인하세요.
