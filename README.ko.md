# Viewstem

[English](README.md) | 한국어

선언형 UI를 위한 프레임워크 독립 런타임입니다. 리소스, 상태, Query, Action,
화면을 JSON으로 선언하고 애플리케이션의 렌더러에 연결합니다.

## 패키지

| 패키지 | 역할 |
|---|---|
| [@viewstem/core](packages/core/README.ko.md) | DOM·프레임워크 의존성 없이 검증, 값, 상태, Query·Action 실행, 화면 수명 관리 |
| [@viewstem/svelte](packages/svelte/README.ko.md) | Svelte 5 클라이언트 렌더러. `createRenderer()`로 시작하고 컴포넌트를 명시적으로 등록 |
| [@viewstem/svelte-ui](packages/svelte-ui/README.ko.md) | kit 또는 컴포넌트군 단위로 가져와 명시적으로 등록하는 선택 shadcn-svelte 컴포넌트 묶음 |

패키지는 로컬에서 빌드하고 검증했습니다. 패키지 버전이나 로컬 검증 결과가
npm 공개 발행을 뜻하지는 않습니다. 공개 API, 지원 동작, 제한은 각 패키지의
README에서 확인하세요.

## 로컬에서 실행하기

저장소를 clone한 뒤 루트에서 실행합니다.

```sh
npm ci --ignore-scripts
npm run playground
```

[바닐라 플레이그라운드](playground/README.ko.md)에서 JSON을 편집하고 화면을
미리 보며 State·Query·Action 실행을 확인할 수 있습니다. Svelte를 확인하려면
별도 터미널에서 다음 명령 중 하나를 실행하세요.

```sh
npm run example:svelte
npm run example:svelte-ui
```

[Svelte 예제](packages/svelte/example/README.ko.md)는 사용자 컴포넌트 등록을
보여줍니다. [shadcn 갤러리](packages/svelte-ui/example/README.ko.md)는 66개
컴포넌트군과 화면 조합 예제 5개를 제공하며 JSON 편집과 런타임 관찰을 지원합니다.
JSON 어댑터와 native Svelte 조합이 필요한 부품의 차이는 해당 README에서 확인하세요.

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
[shadcn·Tailwind 및 관련 UI 소스](packages/svelte-ui/upstream/NOTICE.txt)가 포함됩니다.
