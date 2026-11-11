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
| 제공되는 Svelte shadcn 컴포넌트로 화면 만들기 | `@viewstem/core`, `@viewstem/svelte`, `@viewstem/svelte-ui` |

### Core만 설치하기

저장소를 clone하고 `npm ci`를 실행한 뒤, 저장소 루트에서 다음 명령을 실행하세요.

```sh
npm run build
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core --pack-destination ../viewstem-packages
```

앱 폴더에서 `npm install /absolute/path/to/viewstem-packages/viewstem-core-0.1.0.tgz`로 설치하세요. 경로는 실제 생성 위치로 바꿉니다. [Core 실행 가이드](../core/guides/runtime/)로 이어가면 됩니다. Svelte 화면을 만들려면 아래 절차를 따르세요.


## 패키지 빌드

저장소를 복제한 뒤 루트에서 다음을 실행합니다. Core, Svelte 렌더러, shadcn 컴포넌트 세트의 패키지 파일을 만듭니다.

```sh
git clone https://github.com/miinhlym/viewstem.git
cd viewstem
npm ci
npm run build:svelte-ui

mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/svelte -w @viewstem/svelte-ui \
  --pack-destination ../viewstem-packages
```

이미 저장소를 복제했다면 해당 저장소 루트에서 `npm ci`부터 실행하세요.

## Svelte 앱에 설치

새 앱이 필요하다면 Viewstem 저장소와 같은 상위 폴더에 만듭니다.

```sh
cd ..
npm create vite@7.1.3 viewstem-demo -- --template svelte --no-interactive
cd viewstem-demo
```

Svelte 앱의 루트에서 아래 명령을 실행하세요. 앱이 `viewstem-packages` 폴더와 같은 상위 폴더에 있다고 가정합니다. 다른 위치에 앱이 있다면 패키지 파일 경로를 맞춰 주세요.

```sh
npm install \
  ../viewstem-packages/viewstem-core-0.1.0.tgz \
  ../viewstem-packages/viewstem-svelte-0.1.0.tgz \
  ../viewstem-packages/viewstem-svelte-ui-0.1.0.tgz
```

Svelte 렌더러는 Core를 내부에서 사용합니다. 빠른 시작에서는 렌더러와 shadcn 컴포넌트 세트를 가져옵니다.

## 다음 단계

[빠른 시작](../quickstart/)에서 방금 준비한 앱에 JSON으로 정의한 버튼을 표시해 보세요.
