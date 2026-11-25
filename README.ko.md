# Viewstem

[English](README.md) | 한국어

선언형 UI를 위한 프레임워크 독립 런타임입니다. 리소스, 상태, Query, Action,
화면을 JSON으로 선언하고 애플리케이션의 렌더러에 연결합니다.

## 패키지

| 패키지 | 역할 |
|---|---|
| [@viewstem/core](packages/core/README.ko.md) | DOM·프레임워크 의존성 없이 검증, 값, 상태, Query·Action 실행, 화면 수명 관리 |
| [@viewstem/dom](packages/dom/README.ko.md) | 브라우저 렌더러와 DOM 컴포넌트 연결자 |
| [@viewstem/svelte](packages/svelte/README.ko.md) | Svelte 5 클라이언트 렌더러. `createRenderer()`로 시작하고 컴포넌트를 명시적으로 등록 |
| [@viewstem/ui](packages/ui/README.ko.md) | 브라우저용 기본 컴포넌트 카탈로그와 스타일 |

패키지는 로컬에서 빌드하고 검증했습니다. 패키지 버전이나 로컬 검증 결과가
npm 공개 발행을 뜻하지는 않습니다. 공개 API, 지원 동작, 제한은 각 패키지의
README에서 확인하세요.

## 브라우저에 View 연결하기

[설치 안내](apps/docs/src/content/docs/ko/docs/installation/index.md#install-browser-ui)에 따라 Core, DOM, UI를 설치합니다. HTML에 `<div id="panel"></div>`를 추가하고 Vite 같은 브라우저 번들러로 아래 코드를 실행합니다.

```ts
import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';

const target = document.getElementById('panel');
if (!target) throw new Error('Missing #panel element');

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const screen = renderer.mount({
  target,
  source: { render: { id: 'hello', componentRef: 'shadcn.Badge', inputs: { text: '안녕하세요' } } },
});
await screen.whenRendered();
```

화면이 닫히면 `screen.unmount()`를 기다립니다. 앱을 종료할 때는 `renderer.dispose()`를 기다린 뒤 앱이 소유한 Runtime의 `runtime.dispose()`도 기다립니다.

## 문서

- [공개 문서](https://viewstem.miinhlym.workers.dev/ko/docs/)에서 설치, 예제, API를 확인하세요.
- [저장소 문서](docs/README.ko.md)에서 구현 경계와 검증·릴리스 절차를 확인하세요.
- [기여 안내](CONTRIBUTING.md) (영문): 개발 환경, 검증, 리뷰, 기여 라이선스.
- [지원](SUPPORT.md) (영문): 문의, 유지보수 정책, 지원 환경.
- [보안](SECURITY.md) (영문): 비공개 취약점 제보.
- [행동강령](CODE_OF_CONDUCT.md) (영문): 참여 원칙과 비공개 신고.

프로젝트·패키지·예제 README와 문서 안내는 상단 링크에서 언어를 전환할 수 있습니다.
설계 명세와 과거 검증 기록은 한국어로 제공합니다.
이슈와 PR은 영어와 한국어 모두 환영합니다.

## 라이선스

별도 표시가 없는 Viewstem 자체 코드·예제·문서는 [MIT 라이선스](LICENSE)를
따르며 저작권 표기는 copyright (c) 2026 miinhlym입니다. 외부 자료는 원래의
라이선스와 고지를 유지합니다. 여기에는 [CEL](packages/core/vendor/cel-js/LICENSE)과
[사이트 UI의 shadcn-svelte 소스](apps/docs/upstream/README.md)와 `@viewstem/ui`에 포함된 Basecoat 라이선스가 포함됩니다.
