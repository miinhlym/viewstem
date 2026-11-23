---
title: 설치
description: 앱에 필요한 Viewstem 패키지를 npm에서 설치합니다.
---

앱 디렉터리에서 용도에 맞는 설치 명령을 실행하세요.

## 요구 사항

- npm 및 지원되는 릴리스 계열의 Node.js 22.12 이상
- 브라우저 예제는 Vite처럼 ESM과 CSS import를 처리하는 번들러
- Svelte 렌더링은 Svelte 5.57.3 이상인 5.x 버전

<a id="install-core"></a>

## Core 런타임

화면 렌더링 없이 View를 실행하고 State, Query, Action을 사용하려면 Core를 설치하세요.

```sh
npm install @viewstem/core
```

[Core 실행 가이드](../core/guides/runtime/)로 이어가세요.

<a id="install-dom"></a>

## 직접 만든 DOM 컴포넌트

직접 만든 컴포넌트로 View를 렌더링하려면 DOM 렌더러를 설치하세요.

```sh
npm install @viewstem/core @viewstem/dom
```

컴포넌트 등록과 마운트는 [DOM 패키지 가이드](https://www.npmjs.com/package/@viewstem/dom)를 참고하세요.

<a id="install-browser-ui"></a>

## 브라우저 UI 카탈로그

브라우저 예제를 실행하려면 Core 런타임, DOM 렌더러, 기본 UI 카탈로그를 설치하세요.

```sh
npm install @viewstem/core @viewstem/dom @viewstem/ui
```

[빠른 시작](../quickstart/)으로 이어가세요.

<a id="install-svelte"></a>

## Svelte 렌더러

Svelte 앱에 Core와 Svelte 렌더러를 설치하세요.

```sh
npm install @viewstem/core @viewstem/svelte
```

[Svelte 연결 가이드](../svelte/guides/mount-in-svelte/)로 이어가세요.
