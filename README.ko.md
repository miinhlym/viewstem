# Viewstem

[English](README.md) | 한국어

선언형 UI를 위한 프레임워크 독립 런타임입니다. 리소스, 상태, Query, Action,
화면을 JSON으로 선언하고 애플리케이션의 렌더러에 연결합니다.

## 패키지

| 패키지 | 역할 |
|---|---|
| [@viewstem/core](packages/core/README.ko.md) | DOM·프레임워크 의존성 없이 검증, 값, 상태, Query·Action 실행, 화면 수명 관리 |
| [@viewstem/svelte](packages/svelte/README.ko.md) | Svelte 5 클라이언트 렌더러. `createRenderer()`로 시작하고 컴포넌트를 명시적으로 등록 |
| [@viewstem/ui](packages/ui/README.ko.md) | 브라우저에서 실행하는 기본 JSON 컴포넌트 카탈로그 |

패키지는 로컬에서 빌드하고 검증했습니다. 패키지 버전이나 로컬 검증 결과가
npm 공개 발행을 뜻하지는 않습니다. 공개 API, 지원 동작, 제한은 각 패키지의
README에서 확인하세요.

## 브라우저에 View 연결하기

```ts
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector<HTMLElement>('#panel')!;
const renderer = createRenderer();
const screen = renderer.mount({
  target,
  source: { render: { id: 'hello', componentRef: 'shadcn.Badge', inputs: { text: '안녕하세요' } } },
});
await screen.ready;
// 라우트가 닫히면 screen.unmount(), 앱이 끝나면 renderer.dispose()를 호출합니다.
```

## 문서

- [문서 안내](docs/README.ko.md): 사용법, 계약, 검증 기록.
- [기여 안내](CONTRIBUTING.ko.md): 개발 환경, 검증, 리뷰, 기여 라이선스.
- [지원](SUPPORT.ko.md): 문의, 유지보수 정책, 지원 환경.
- [보안](SECURITY.ko.md): 비공개 취약점 제보.
- [행동강령](CODE_OF_CONDUCT.ko.md): 참여 원칙과 비공개 신고.

사용자용 안내는 영문을 기본으로 제공하며 각 문서 상단에서 한국어 문서로
전환할 수 있습니다. 설계 명세와 과거 검증 기록은 한국어를 유지합니다.
이슈와 PR은 영어와 한국어 모두 환영합니다.

## 라이선스

별도 표시가 없는 Viewstem 자체 코드·예제·문서는 [MIT 라이선스](LICENSE)를
따르며 저작권 표기는 copyright (c) 2026 miinhlym입니다. 외부 자료는 원래의
라이선스와 고지를 유지합니다. 여기에는 [CEL](packages/core/vendor/cel-js/LICENSE)과
[사이트 UI의 shadcn-svelte 소스](apps/docs/upstream/README.md)와 `@viewstem/ui`에 포함된 Basecoat 라이선스가 포함됩니다.
