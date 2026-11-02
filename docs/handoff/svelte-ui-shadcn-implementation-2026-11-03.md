# Svelte UI·shadcn 구현 인계 · U44

U44에서 사용자가 U43 계획의 구현을 승인했다. `@viewstem/svelte-ui`의 실제 패키지, 고정 원본·CSS 빌드, 전체 카탈로그 갤러리와 회귀 검사를 추가했다. 외부 발행이나 커밋은 이번 요청에 포함되지 않는다. [사용법](../../packages/svelte-ui/README.md)과 [기계 판독 검증 기록](svelte-ui-shadcn-verification-results.json)이 현재 결과의 기준이다. U43 계획·조사와 이전 U37–U42 검증 결과는 당시 증거로 보존한다.

후속 요청으로 추가한 [화면 예제 5개](svelte-ui-examples-2026-11-03.md)와 [U45·66개 컴포넌트 동작 감사](svelte-ui-audit-2026-11-03.md)는 별도 검증 기록을 따른다. 이 문서의 U44 검증 수와 해시는 원래 실행 시점의 증거다. 최신 동작 수정과 검증 범위는 U45 기록을 확인한다.

## 실제 지원 범위

| 대상 | 구현 경로와 관찰 기준 |
|---|---|
| 공식 카탈로그 66개 컴포넌트군 | 모든 family subpath와 전체 shadcn 묶음, 66개 편집 가능한 JSON 예제. 정상 DOM witness와 오류 복원 검사 |
| 원본 공개 부품 386개 | 351개는 JSON adapter와 실제 예제 참조, 35개는 native Svelte context fixture. 목록 누락 0개를 inventory와 대조 |
| JSON 조합 6개 | Combobox, DatePicker, DataTable, Typography, Chart, Notifications. 실제 Bits UI/TanStack/LayerChart/Sonner 사용 |
| native context 전용 35개 | Calendar·RangeCalendar 각각 하위 부품 17개와 Chart.Tooltip. 공개 `components` namespace, 실제 native scoped 조합 및 tooltip hover. JSON ID로 등록하지 않음 |
| 등록·타입·배포물 | root API, 66 subpath, CSS, support manifest, NOTICE, 별도 설치한 core/Svelte/UI tarball 소비자 |

단순 슬롯·입력·이벤트는 공통 adapter를 사용한다. 날짜 codec, DOM 이벤트 투영, child snippet의 DOM props/attachment 전달, native 입력의 조합 중 draft만 UI 경계에 둔다. core의 State/Query/Action을 복제하지 않는다. 함수·DOM 객체·scoped formatter를 JSON으로 지원하는 것처럼 표시하지 않으며, 정확한 입력·이벤트·제외 사유는 패키지 support.json에 생성한다.

## 변경된 공통 계약

- Registry의 `registerComponentContracts`와 Renderer의 `registerComponents`가 계약·구현 일괄 등록을 검증 후 원자적으로 반영한다. 실패 시 일부만 등록되지 않는다. 공개 타입에 ComponentRegistration을 추가했다.
- UI의 native callback은 microtask 뒤 기존 core emit으로 연결한다. submit의 기본 브라우저 이동 차단은 동기적이다. 직접 core emit, initialComplete, whenRendered의 의미는 유지한다.
- View가 먼저 폐기되고 DOM이 아직 붙은 동안 emit하면 CANCELLED Promise로 거절한다. 동기 예외로 브라우저에 새어 나오지 않는다.
- UI가 준비되지 않은 필수 입력으로 시작하면 native 인스턴스를 만들지 않는다. 기존 준비된 입력이 오류가 되면 마지막 표시·텍스트를 유지하고 지원되는 disabled prop을 적용한다. 기존 이벤트의 실행 가능성은 core가 다시 확인한다.

## 고정 원본과 빌드

shadcn-svelte `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`의 Nova·neutral·Lucide 조합을 사용한다. official transformed registry archive와 파일별 해시를 보존하고, 상대 import·icon·style marker·이벤트 합성만 재현 가능한 변환으로 적용한다. [source.json](../../packages/svelte-ui/upstream/source.json), [NOTICE](../../packages/svelte-ui/upstream/NOTICE.txt), [vendor 생성기](../../packages/svelte-ui/scripts/vendor-source.mjs)가 해당 근거다.

Sonner 1.2.0은 인스턴스가 닫힐 때 해당 알림과 timer를 확실히 지우기 위해 같은 고정 런타임을 private vendoring한다. 별도 외부 Sonner singleton과 혼용하지 않는다. 원본 hash·라이선스 및 상대 module import 변환은 [재현 스크립트](../../packages/svelte-ui/upstream/sonner-runtime.mjs)로 확인한다.

`generate-catalog`는 설치된 고정 dependency와 upstream Svelte 선언에서 JSON projection을 추출한다. 중간 13 MB 카탈로그는 무시되는 `.type-cache`에만 두고, 배포물은 family 코드·공유 schema 상수·중복 집합을 참조하는 support.json을 포함한다. `check:generated`는 vendor·Sonner·계약·CSS의 재생성 일치를 검사한다. npm 설치 script 실행은 필요하지 않다.

## 검증 구성과 발견한 회귀

| 검사 | 실제 확인 내용 |
|---|---|
| catalog.browser | 66개 DOM 순회, 351+35 부품 대응, Action·한글 입력·Query·오류 JSON, modal/menu/select/tooltip, raw Calendar/LayerChart 문맥 |
| controls.browser | Accordion/Collapsible/Tabs, Checkbox/Switch/Radio/Slider, Toggle/OTP/NativeSelect, Carousel, Resizable/Sidebar, Navigation/Questionnaire, Clipboard/MessageScroller/Trace |
| recipes.browser | 레시피 6개의 제어 값·Action/State, 4종 실제 SVG, 데이터 null, 알림 중복·격리·갱신·폐기 |
| bridge.browser | IME와 무관한 projection, 한 번의 확정 Action, 날짜 null reset, when/repeat/replace/dispose, 필수 입력 대기·오류 회복, child/focus/theme, 실행 URL 거절 |
| ime-domain.browser | Command/Input OTP의 즉시·지연 최종 input, 길이·패턴 제한, 조합 중 complete 차단·최종 complete 한 번, 후속 입력의 재완료 |
| test-package | 실제 3개 tarball 설치, 66개 typed import, 브라우저 ESM·전체 등록, Button CSS와 폐기, 선택/전체 번들 module 목록·크기 |

검증 중 발견한 문제와 수정은 영구 검사에 연결했다.

1. 빈 slot 배열을 콘텐츠로 처리해 text·기본 아이콘·Select.Value 표시가 사라짐: 실제 자식 또는 명시 text가 있을 때만 snippet을 전달한다.
2. IME draft가 무관한 State 갱신에 의해 초기값으로 되돌아감: native composition draft를 보존하고 확정 이벤트의 중복 Action을 막는다.
3. Carousel·InputGroup·Sidebar의 내부 이벤트를 restProps가 덮음: 검증된 4개 wrapper의 6개 handler를 consumer handler와 합성한다.
4. controlled modal의 닫기 뒤 body scroll/pointer lock이 남음: native effect 초기화 스택 중 동기 core projection 재진입이 원인이었다. in-memory 비교에서 microtask 경계가 cleanup을 보존함을 확인하고 실제 패키지에 적용했다. body 스타일을 강제로 지우는 우회는 쓰지 않는다.
5. View 폐기 직후 emit이 동기 예외를 던짐: renderer에서 항상 거절 Promise와 진단으로 정리했다. State/Action이 없는 폐기 View의 unhandled event가 성공하던 core 분기도 CANCELLED로 고치고 두 패키지에 회귀 검사를 추가했다.
6. 줄바꿈을 섞은 javascript URL이 단순 정규식을 우회함: 브라우저 URL parser로 scheme을 판별한다.
7. 입력 오류 중 버튼의 마지막 text가 사라짐: 마지막으로 준비된 props와 text를 함께 보존한다.
8. Input OTP의 한글 확정이 중간값을 보내거나 Action을 두 번 실행함: 최종 DOM 값을 native 길이·패턴 정책으로 변환하고 후속 input을 중복 제거한다. upstream의 `onComplete(...args: any[])` 선언을 배열 payload로 오인하던 계약은 실제 문자열 호출에 맞췄다. complete는 조합이 끝난 뒤 한 번 전달하며 후속 편집에서 같은 값을 다시 완성할 수 있다. native effect가 동일 complete callback을 다시 호출해 Action과 projection을 반복하는 경우도 값 단위 중복 방지로 차단했다.

갤러리는 데스크톱에서 화면 높이를 채우고 JSON 편집·미리보기·검사 패널의 스크롤을 분리한다. 1280×800과 390×844에서 페이지 넘침·패널 크기를 검사한다.

정확한 Node/Chromium 버전, 통과 수, tarball·bundle 크기, 소스·산출물 해시는 [실행 기록](svelte-ui-shadcn-verification-results.json)에 둔다. core 인수 216개와 선택 차트 8개는 기존 범위를 유지하며 이번 UI 검사 수와 합산하지 않는다.

## 남은 제한

- JSON에 scoped slot/function/FileList/DOM ref 문법을 추가하지 않았다. custom cell·date matcher·Chart formatter 등은 native host 조합이다. 35개 native 전용 부품을 JSON 지원 수로 세지 않는다.
- 현재 theme는 Nova·neutral·Lucide 하나이며 CSS는 전체 공유한다. 선택 import의 JS 분리와 npm 설치 의존성 분리는 다르다. portal theme는 실제 DOM 조상인 html/body에 맞춘다.
- Node 22/24·Chromium·Svelte 5 client, TypeScript Bundler 해석을 검증한다. LayerChart/TanStack의 upstream declaration 오류는 `skipLibCheck`로 제외하지만 자체 소스와 소비자 코드는 strict 검사한다. SSR/hydration, Safari/Firefox 전체 적합성을 주장하지 않는다.
- DataTable은 scalar cell, Chart는 명시된 line/area/bar/pie 데이터 계약이다. ECharts/Canvas 선택 차트, Flutter, React, Skeleton kit는 후속 범위다.
- 전체 bundle은 mode-watcher의 localStorage 접근이 가능한 origin에서 사용한다. raw Sonner의 host toast는 toasterId·cleanup을 호스트가 소유하며 JSON Notifications의 인스턴스 격리와 구별한다.
