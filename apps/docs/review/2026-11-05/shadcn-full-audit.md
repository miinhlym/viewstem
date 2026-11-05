# shadcn-svelte 전체 미리보기 감사

2026-11-05 · D126. 대상은 라이브러리 사이트의 66개 컴포넌트 계열, 한국어·영어 132페이지다. 유사 디자인을 재작성하지 않고 고정 공식 소스와 공식 조합 예제를 사용한다.

## 출처와 구현 범위

고정 revision은 `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`, 스타일은 Nova, 기본 색상은 Neutral이다. 62계열은 공식 registry의 456파일·386 공개 부품에서 생성한다. 나머지 Combobox·DatePicker·DataTable은 공식 문서와 마찬가지로 실제 Button·Popover·Command·Calendar·Table 등 원본 부품의 조합이다. Typography는 공식 예제의 태그·utility를 사용한다. Chart는 원본 Chart.Container·Tooltip과 공식 문서에서 사용하는 LayerChart를 조합한다. 존재하지 않는 단일 upstream 컴포넌트를 사용한다고 표현하지 않는다.

공식 예제: [Combobox](https://github.com/huntabyte/shadcn-svelte/blob/fe4b0ad3b8b30c6745346db008c3307b5afeabb1/docs/src/lib/registry/examples/combobox-demo.svelte), [DatePicker](https://github.com/huntabyte/shadcn-svelte/blob/fe4b0ad3b8b30c6745346db008c3307b5afeabb1/docs/src/lib/registry/examples/date-picker-demo.svelte), [DataTable](https://github.com/huntabyte/shadcn-svelte/blob/fe4b0ad3b8b30c6745346db008c3307b5afeabb1/docs/src/lib/registry/examples/data-table-demo.svelte), [Typography](https://github.com/huntabyte/shadcn-svelte/blob/fe4b0ad3b8b30c6745346db008c3307b5afeabb1/docs/src/lib/registry/examples/typography-demo.svelte). 공식 [Accordion](https://shadcn-svelte.com/docs/components/accordion)도 비교했다.

## 발견한 문제와 수정

앞선 D125 검증은 실제 컴포넌트와 Neutral 토큰 사용을 확인했지만 CSS 적용 순서·완전한 초기화·내부 래퍼까지 검증하지 못했다. 원본 소스를 import하는 것만으로 같은 디자인이 보장되지 않았다.

- Starlight의 `font: inherit` reset이 shadcn utility보다 뒤에 적용되어 Accordion trigger가 14px/20px·500 대신 16px/28px·400이었다. 첫 CSS에서 cascade layer 순서를 선언해 원본 utility가 적용되도록 수정했다. LayerChart의 component 층도 원본 Chart utility보다 먼저 배치한다.
- 패키지 CSS가 Tailwind preflight 일부만 손으로 재현하고 있었다. 원본 preflight 전체를 UI 범위에 한정해 사용한다. heading·SVG·`hidden` 등의 원본 동작이 복원되며 호스트의 선택된 폰트는 상속한다. Questionnaire에서 숨겨진 단계·이전/제출 버튼이 보이던 문제도 이 원인이었다.
- Marker는 props spread 때문에 루트의 범위 표시가 누락됐다. 공통 props에 표시를 넣었다. Bits InputOTP는 data 속성을 input으로 보내고 class는 wrapper로 보내므로, wrapper에 전용 범위 클래스만 추가했다. DOM이나 원본 동작을 새로 만들지 않았다. 이 처리는 재생성 가능한 generator에 있다.
- DataTable의 직접 작성한 input·checkbox·select를 실제 원본 Input·Checkbox·NativeSelect·Label로 교체했다. TanStack 상태 계약과 키보드 선택을 유지한다. Combobox·DatePicker의 trigger와 Typography는 고정 공식 예제의 구성과 클래스를 따른다.
- AspectRatio의 절대 위치 내부 요소에 잘못 지정한 최대 너비를 제거해 16:9를 복원했다. Spinner 예제는 버튼 안 문구에 문단용 여백이 생기지 않도록 기존 Typography의 `small` variant를 사용한다. 표시·복사·실행 JSON은 동일하다.
- 사이트 헤더 테마와 기존 Pretendard/D2Coding 서체 계약은 유지한다. 미리보기·옵션·포털은 기본 Neutral을 사용한다.

## 검증 방식과 범위

1. 출처: generator byte-for-byte 검사로 고정 snapshot, 변환과 62계열·386부품을 대조했다. 기존 이벤트·수명 호환성 수정은 유지했다.
2. 시각: 66계열 전체 초기 화면과 15개 팝업을 확인했다. 최초 발견 목록은 [시각 인벤토리](shadcn-full-audit/visual-inventory.json)에 보존한다. 이후 AspectRatio·OTP·Spinner를 두 폭과 두 테마 12조합에서 재검증했다. [측정 결과](shadcn-full-audit/layout-recheck.json)
3. 스타일: 별도 iframe에서 고정 upstream registry와 원본 Tailwind preflight/utility를 직접 컴파일하고, 같은 렌더링 DOM의 21개 computed style 속성을 비교한다. Viewstem CSS 생성기·생성 CSS를 정답으로 재사용하지 않는다. 66계열 × 375/1440px × light/dark = 264조합이다. 원본 폰트 상속 및 LayerChart 의존 CSS를 동일하게 제공한다. [결과](shadcn-full-audit/styles.json)
4. 동작: 패키지 브라우저 테스트, 한·영 132페이지의 JSON·메뉴·렌더링·320px 넘침 검사, 주요 8계열의 64조합 옵션 변경·테마·초기화·복사를 검사한다. [페이지](shadcn-full-audit/demos.json), [옵션](shadcn-full-audit/options.json)
5. 타입·빌드: 모든 workspace 타입 검사, 132개 실제 표시 setup.ts/view.json 타입 검사, 패키지 export 검사, Astro 정적 빌드, 335 HTML·46,100 내부 링크 검사를 수행했다. [사이트 검사](shadcn-full-audit/site.json)

스타일 oracle은 실제 렌더링 DOM의 CSS 통합 검증이다. 별도의 upstream 렌더러로 모든 상태를 재현한 픽셀 비교는 아니다. 소스 검사·전수 초기 시각 검토·행동 테스트를 함께 사용하며, 각 시각 인벤토리의 상호작용 미검증 범위를 숨기지 않는다. 브라우저는 Chromium이며 Firefox·WebKit 검증을 주장하지 않는다. 1px 이내 margin 반올림은 허용하고, 논리적 auto margin은 직렬화 대신 실제 위치로 비교한다. 검증 스크립트는 실제 스타일 차이 또는 실행 오류가 있으면 실패한다.

## 최종 결과

- 264/264 스타일 조합: 실행 오류·21개 속성 차이 0.
- 132/132 한·영 페이지, 64개 옵션 매트릭스와 3개 추가 흐름 묶음: 실패 0.
- 패키지 브라우저 테스트 110/110 통과. [실행 기록](shadcn-full-audit/package-tests.json)
- 모든 workspace 타입 검사, 생성물 일치, 패키지 export·ESM consumer 검사, 132개 표시 코드 타입 검사 통과. docs는 오류·경고·hint 0.
- 렌더러 수명 단위 테스트 4/4 통과. Svelte autofixer의 변경 컴포넌트 오류 0. 원본 Marker의 bind:this 일반 권고는 원본 구조를 유지하기 위해 바꾸지 않았다.
- 4321 개발 서버에서도 밝은 1440px·어두운 375px에서 Accordion 14px/20px·500과 OTP 가로 배치·넘침 없음을 확인했다. [측정](shadcn-full-audit/dev.json)

배포하지 않았다. 정적 빌드의 기존 sitemap 주소 미설정·Markdown 설정 폐기 예정·LayerChart 미사용 import 경고는 이번 컴포넌트 수정과 별도다.
