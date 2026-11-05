---
title: "@viewstem/core"
description: "브라우저나 UI 프레임워크 없이 Viewstem 정의를 실행합니다. Core는 리소스를 검증하고 State와 실행 수명을 관리하며, 렌더러가 표시할 스냅샷을 제공합니다."
sidebar:
  order: 0
---

브라우저나 UI 프레임워크 없이 Viewstem 정의를 실행합니다. Core는 리소스를 검증하고 State와 실행 수명을 관리하며, 렌더러가 표시할 스냅샷을 제공합니다.

## 진입점 선택하기

| import 경로 | 용도 |
|---|---|
| `@viewstem/core` | Registry, StateStore, Runtime, View, URL 병합, Grid 배치 |
| `@viewstem/core/http` | 전송·권한·비밀값 해석을 연결하는 HTTP 실행기 |
| `@viewstem/core/cel` | 동기 CEL 표현식 컴파일과 평가 |
| `@viewstem/core/cel-support.json` | 지원하는 CEL 시그니처의 기계 판독용 목록 |

현재 패키지는 ESM이며 Node에서 사용할 때 Node.js 22 이상이 필요합니다. [설치](../installation/)에 따라 로컬 패키지를 빌드·설치하세요. 이 문서가 npm 발행을 뜻하지는 않습니다. 브라우저에서는 ESM을 처리하는 번들러를 사용합니다. Core 자체는 UI 컴포넌트를 등록하거나 DOM을 그리지 않습니다.

## 앱에서 Core 사용하기

1. [View 실행하고 관찰하기](./guides/runtime/): 컴포넌트 계약을 등록하고 View를 만든 뒤 결과를 읽고 정리합니다.
2. [State 공유와 URL 동기화](./guides/state-and-url/): 호스트가 소유한 셀과 명시적인 URL 어댑터를 연결합니다.
3. [HTTP와 코드 Action 연결하기](./guides/http-and-actions/): 요청 실행기를 주입하고 Action 계약을 통해 앱 함수를 호출합니다.

Svelte 화면을 만들려면 [Svelte 렌더러](../svelte/)에서 시작하세요. 렌더러가 내부 Core 런타임을 만들거나 전달받습니다.

## API 찾기

| 영역 | 레퍼런스 |
|---|---|
| 정의 등록과 코드 Action | [Registry](./registry/) |
| 호스트 실행과 권한 | [Runtime](./runtime/) |
| 실행 중인 화면과 스냅샷 | [View](./view/) |
| 호스트 State, 트랜잭션, reaction, 시계 | [StateStore](./state-store/) |
| URL 어댑터와 소유권 | [URL](./url/) |
| 네트워크 실행 | [HTTP](./http/) |
| 표현식 평가 | [CEL](./cel/) |
| 배치 계산 | [Grid 유틸리티](./utilities/) |
| 전체 공개 타입과 export | [공개 API 색인](./types/) |

`Registry`, `StateStore`, `Runtime`, `View`는 생성자가 아닌 타입입니다. 팩토리로 객체를 얻으세요. 발급받은 핸들을 그대로 유지해야 하며 객체를 복사하거나 같은 모양으로 만든다고 유효한 핸들이 되지 않습니다. JSON 정의의 필드는 [DSL 레퍼런스](../dsl/)에서 설명합니다.
