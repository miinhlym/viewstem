---
title: 설치
description: 앱에 필요한 패키지를 선택하고 소스 빌드 파일로 설치합니다.
---

Viewstem 패키지는 공개 npm 레지스트리에 아직 발행되지 않았습니다. 소스에서 패키지 파일을 만든 뒤 앱에 설치할 수 있습니다.

## 요구 사항

- Git과 npm
- 지원되는 릴리스 계열의 Node.js 22.12 이상
- Svelte로 렌더링할 때는 Svelte 5.57.3 이상의 5.x 앱이 필요합니다. Core만 사용하면 Svelte는 필요하지 않습니다.

## 사용할 패키지 선택하기

| 하려는 일 | 필요한 패키지 |
|---|---|
| DOM 없이 실행·상태·Query를 사용하기 | `@viewstem/core` |
| 공통 UI 카탈로그를 브라우저 DOM에 렌더링하기 | `@viewstem/core`, `@viewstem/ui` ([로컬 빌드 및 설치](../ui/guides/mount-in-browser/)) |
| 직접 만든 Svelte 컴포넌트로 렌더링하기 | `@viewstem/core`, `@viewstem/svelte` |

### Core만 설치하기

저장소를 clone하고 `npm ci`를 실행한 뒤, 저장소 루트에서 다음 명령을 실행하세요.

```sh
npm run build
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core --pack-destination ../viewstem-packages
```

앱 폴더에서 `npm install /absolute/path/to/viewstem-packages/viewstem-core-0.1.0.tgz`로 설치하세요. 경로는 실제 생성 위치로 바꿉니다. [Core 실행 가이드](../core/guides/runtime/)로 이어가면 됩니다. Svelte 화면을 만들려면 아래 절차를 따르세요.

## 브라우저 UI 패키지 빌드

저장소 루트에서 `npm ci`를 실행한 뒤 다음 명령을 실행하세요.

```sh
npm run build:ui
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/ui --pack-destination ../viewstem-packages
```

앱 디렉터리에서 두 tarball을 설치합니다. 아래 경로는 앱과 `viewstem-packages`가 같은 상위 디렉터리에 있을 때의 예입니다.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-ui-0.1.0.tgz
```

[빠른 시작](../quickstart/)은 순수 JS Vite 앱이나 기존 브라우저 앱의 DOM 컨테이너에서 실행할 수 있습니다. 앱의 Svelte 컴포넌트를 연결하려면 `npm run build:svelte`를 실행하고 `npm pack -w @viewstem/svelte --pack-destination ../viewstem-packages`로 패키지를 만든 뒤 [Svelte에서 마운트](../svelte/guides/mount-in-svelte/) 가이드를 따르세요.
