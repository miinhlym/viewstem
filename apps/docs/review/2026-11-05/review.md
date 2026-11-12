# 공개 문서 사이트 EGM 리뷰

대상은 `apps/docs`의 실제 라이브러리 사이트 문서와 화면이다. 저장소 설계·인수인계 문서 자체를 리뷰 대상으로 바꾸지 않았다. EGM의 Comprehension, Style, Design Critic 페르소나를 각각 대화 이력이 없는 `fork_turns: none` 리뷰어로 실행했다. 프로젝트 지침의 주입까지 차단되었다고 주장하지 않는다. 이 기록은 사이트에 맞춘 독립 리뷰이며 설계문서용 5단계 파이프라인이나 두 번 연속 clean round 수렴을 완료했다는 뜻이 아니다.

## 기준과 공식 레퍼런스

[검토 기준](criteria.md)에 독자 작업·범위·완료 조건을 먼저 정했다. 색상은 기존 밝은 배경 #f8fafc / 글자 #172437 / 링크 #0f766e, 어두운 배경 #111b28 / 글자 #edf3fa / 링크 #80dfcc를 유지한다. Pretendard 본문과 D2Coding 코드를 유지한다. 본문 폭은 46rem, 제목은 h1 > h2 > h3 > h4로 설정하고, 상위 경로·현재 페이지·API 표가 각각 다른 정보를 담당하도록 한다. 장식용 카드·뱃지와 추가 자동 애니메이션은 도입하지 않는다.

- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview): 시작·가이드·API·예제를 나누며 사용 목적에서 학습 경로로 이어진다. 패키지 선택과 실행 절차를 분리하는 근거로 참고했다.
- [Svelte](https://svelte.dev/docs/svelte/overview): 개념과 구문·모듈 레퍼런스를 분리한다. 개념을 읽은 뒤 관련 문법에 바로 연결하는 방식을 참고했다.
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog): 컴포넌트의 목적과 조합 예제를 API 계약보다 앞에 제시한다. Viewstem UI의 긴 입력 표 앞에 실제 View 예제를 넣는 근거로 참고했다.
- [Starlight 스타일 가이드](https://starlight.astro.build/guides/css-and-tailwind/): 테마 토큰과 cascade layer를 사용한다. 제목 요소 한 종류만 덮어쓰던 방식을 공통 크기 변수로 교체했다.

## 독립 리뷰 결과

### Comprehension — 완료

**What this proposes:** Viewstem은 화면 구조와 동작을 JSON으로 선언하고 앱에 등록한 UI 구현에 연결한다. 설치와 첫 실행 다음에 입력·상태·계산·조회·동작을 배우며, Core는 실행, Svelte는 렌더링 연결, UI는 선택적 스타일 컴포넌트를 제공한다.

**How the existing system works, per this document:** View는 render 노드에서 시작하고 Component를 조합한다. ports는 계약, inputs는 호출 값·핸들이다. State는 인스턴스 값, Derived는 Variable 계산, Query는 조회, Action은 명시적 실행이다. 정의 공유와 실행 인스턴스 공유는 다르며 앱이 등록과 수명을 관리한다.

상세 읽기: 언어별 25개, 총 50개 페이지. 진입 3개, 개념 9개, 패키지 개요 3개, 패키지 가이드 9개, DSL 개요 1개. 일부 DSL·CEL 계약을 추가 확인했다. 재서술이 불가능한 Blocker는 없었다.

- C1 Major: JS Vite 설치 경로에서 Svelte 가이드의 main.ts로 옮기는 HTML script·mount target 수정이 빠졌다.
- C2 Nit: 개념의 함수 계산·슬롯·Query 주기 설명에서 정확한 DSL 계약으로 가는 연결이 부족했다.
- C3 Nit: Core만 쓰는 독자도 설치 문서에서 Svelte 앱을 요구하는 것처럼 읽혔다.

### Style / Reference — 완료

인벤토리: 가이드 제외 양 언어 194개 페이지. Core·Svelte 레퍼런스 전체, DSL 설명·표, UI 카탈로그·생성기, 66개 계열의 제목·길이·예제 유무와 한국어 도입문을 확인했다. UI의 모든 행을 상세 검토한 것은 아니다. Button, DataTable, Chart, Calendar, Combobox, DatePicker, Input OTP, Sonner를 상세 읽고 Questionnaire·Spinner의 관련 부분을 집중 확인했다.

- R1 Major: Spinner의 SVG 입력과 OTP의 일반 HTML 입력이 필수·고유 옵션보다 앞에 나왔다.
- R2 Major: Sonner toastOptions.classes, Questionnaire items, Chart config 등 중첩 타입이 큰 표 한 셀에만 나타나 의미·구조를 읽기 어렵다.
- R3 Major: UI 계열 상세 페이지는 현재 위치와 카탈로그 복귀 경로가 없었다.
- R4 Nit: ViewTarget, PublicError, NodeSnapshot 링크가 구체 계약 대신 Core 타입 색인 최상단을 경유했다.

### Design / Presentation — 완료

문서 CSS·공유 테마·헤더·pagination·메뉴 및 설치된 Starlight 소스의 정적 검토. 브라우저 관찰은 주 작업자가 별도로 수행했다.

- P1 Major: R3과 동일한 원인으로 132개 계열 페이지에서 현재 메뉴 표시·그룹 열림·이전/다음이 모두 없었다. 빈 pagination landmark도 출력됐다.
- P2 Major: h2만 축소해 h3보다 작아지는 제목 계층 역전이 있었다.
- P3 Nit: 초기 시스템 테마만 적용되고 실시간 변경을 듣는 ThemeSelect는 렌더링되지 않았다. 홈·예제·Playground에는 초기화도 없어 이동 시 색상이 바뀔 수 있었다.

일반 Markdown에 UI reset이 직접 적용된다는 가설은 근거가 없어 기각했다. 주요 색상 토큰의 대비는 문제가 없었으므로 팔레트 교체도 하지 않았다. 모바일 메뉴의 Escape·포커스 복귀·본문 inert와 reduced-motion 처리는 이미 구현되어 있어 새 결함으로 보고하지 않았다.

## 처리 결정

| 항목 | 결정·수정 범위 |
|---|---|
| C1 | 설치 후 main.ts와 id=app으로 연결하는 HTML 예제를 추가하고 후속 가이드에 직접 연결한다. |
| C2 | 개념 설명의 끝에서 관련 DSL·CEL 계약으로 바로 연결한다. |
| C3 | 패키지 선택 표와 Core만 빌드·pack·설치하는 경로를 제공한다. |
| R1·R2 | 생성기의 입력 표와 예제 순서를 개선한다. 원래 지원 필드·스키마·앵커는 보존한다. |
| R3·P1 | 상위 경로를 표시하고 카탈로그 바로 아래에 현재 상세 페이지만 메뉴에 넣는다. 계열 간 이전·다음은 같은 언어의 파일 목록에서 만든다. 빈 pagination은 출력하지 않는다. 66개 계열을 모두 펼치는 안은 탐색 길이를 늘리므로 채택하지 않는다. |
| R4 | 특정 이름은 해당 API 절로 직접 연결한다. 전체 목록용 색인 링크는 유지한다. |
| P2 | Starlight 제목 변수를 함께 설정해 wrapper·anchor도 같은 크기 체계를 따르게 한다. |
| P3 | 공통 테마 초기화와 선택 UI를 제공한다. 저장된 선택·시스템 변경·다른 탭의 변경을 반영한다. |

## 검증

최종 실행 결과와 알려진 제한은 `verification.json`에 기록한다. 라이브러리 런타임 계약은 변경하지 않는다. 공개 배포·커밋은 수행하지 않는다.


## 적용 후 독립 재검토

별도의 fresh-context Design Critic가 새 테마·문서 경로·pagination·제목 구현과 양언어 설치·Svelte 가이드 8개를 검토했다. Blocker/Major 회귀는 없었다. 표 관찰자의 BFCache 복귀 처리는 `pageshow.persisted`에서 다시 연결하도록 보완했고, 재검토자가 소스로 해결을 확인했다. 남은 두 Nit도 적용했다: JS가 없을 때 테마 select를 비활성화하고, 개념·가이드 상위 경로를 문서 홈의 해당 섹션 앵커로 연결했다.

주 작업자가 기존 복합 가이드 8개를 추가 확인하면서 폼 검증·Query 대시보드의 내용이 개요 수준인 점을 발견했다. 두 가이드를 한·영 실행 예제로 보강했고, 나머지 두 가이드의 외부 명세 링크도 사이트 안의 DSL로 교체했다. 중첩 필드 링크는 접힌 details를 자동으로 열어 목적지를 보여 준다. 전체 빌드 검사에서 중복 anchor ID 8개도 제거했다. 기존 URL은 자동 생성되는 같은 ID로 유지된다.

UI 생성기의 최종 확인: 계열 66개 × 2언어, JSON 부품 앵커 357개/언어, 지원 입력 34,133개/언어를 보존했다. 스니펫 150개 타입 검사와 Chromium 동작 34개가 통과했다. 복합 가이드의 정확한 Markdown 코드 4개도 Chromium에서 검증했으며 페이지 오류와 외부 요청이 없었다.


## 최종 실행 결과

- Astro 프로덕션 빌드 성공: 331개 페이지, 검색 색인 335개 HTML. 기존 workspace 패키지 빌드 산출물을 사용했다.
- 정적 검사: 한·영 123쌍, UI 계열 132개 페이지의 현재 메뉴·이전/다음, 로컬 링크 29,146개. 누락 경로·앵커와 중복 ID 오류 0개.
- Chromium: 문서 246개 전체를 320px·어두운 테마에서 검사해 페이지 가로 넘침 0개. 1440px·밝은 테마 대표 20개도 넘침 0개. 전체 페이지 검사는 레이아웃 수치 검사이며, 모든 내용을 정독했다는 뜻은 아니다.
- 모바일 메뉴의 현재 위치·Escape·포커스 복귀, 표 키보드 스크롤, 테마 유지·시스템 변경, 양언어 검색·언어 전환, 접힌 상세의 깊은 링크, JS 비활성 상태와 reduced-motion을 확인했다. 관찰한 콘솔 오류는 없다.
- UI 예제 150개 타입 검사·34개 Chromium 동작 검사, 폼·Query 가이드 4개 실제 Markdown 스크립트 실행 성공. Query 가이드는 주입한 HTTP transport 모의 응답으로 성공·대기·실패·복구를 검사했다.
- 변경한 Astro 클라이언트 스크립트 strict 검사 오류 0개. 전체 사이트 타입 검사는 설치된 Starlight 내부의 기존 TS18048 오류 1개가 남아 있다: `node_modules/@astrojs/starlight/utils/i18n.ts:94`, `astroI18nConfig.routing` possibly undefined. 전체 타입 검사를 통과한 것으로 보고하지 않는다.
- Firefox·WebKit은 실행하지 않았다. BFCache 표 관찰자 복귀 수정은 독립 소스 재검토로 확인했다. 별도 BFCache 브라우저 재현은 하지 않았다.

자세한 수치와 범위는 [verification.json](verification.json), [정적 검사](static-verification.json), [모바일 검사](mobile-verification.json), [데스크톱 검사](desktop-verification.json)에 기록했다.

재실행 명령(저장소 루트):

```sh
npm --workspace @viewstem/docs run build
node apps/docs/scripts/verify-docs-site.mjs
node apps/docs/scripts/generate-ui-reference.mjs --check
node apps/docs/scripts/verify-ui-docs.mjs
node apps/docs/scripts/verify-task-guides.mjs
```

기존 개발 서버 `http://localhost:4321`은 유지했다. 검증용 임시 정적 서버는 종료했다. 공개 배포·커밋은 하지 않았다.


## 후속 수정: Starlight 타입 오류 해결

앞서 남긴 TS18048 제한은 해결했다. Starlight 0.39.3이 Astro의 선택 항목 `i18n.routing`을 항상 존재한다고 가정한 것이 원인이다. `routing?.prefixDefaultLocale ?? false`로 문서상 기본값을 적용하는 버전별 패치를 추가했다. 루트 `postinstall`에서 `patch-package --error-on-fail`로 재적용하며, 실제 패치 제거·재적용도 확인했다. [패치 설명](../../../../patches/README.md)에 적용 이유와 제거 조건을 남겼다.

문서 사이트에 `@astrojs/check`와 `typecheck` 명령을 추가해 Astro 진단과 TypeScript 검사를 함께 실행한다. 전체 워크스페이스 검사 중 발견한 MDX 전역 타입의 Svelte 패키지 유입은 `types: ["svelte"]`로 필요한 전역 타입을 명시해 해결했다. 기존 strict와 skipLibCheck=false를 유지했고, 명시적으로 가져오는 의존성 타입은 계속 검사한다.

`npm run typecheck --workspaces --if-present`가 종료 코드 0으로 완료됐다. Core, Svelte 및 예제, 문서 사이트 전체가 통과했다. Astro 진단 41개 파일은 오류·경고·힌트 모두 0개다. [실행 로그](typecheck-output.log)와 [상세 결과](typecheck-verification.json)를 보존했다. 라우팅 기본값·명시값·manual 거절 8개 시나리오, 전체 문서 빌드(패키지 선행 빌드 포함), 로컬 링크 29,146개 검사도 통과했다. 기존 빌드의 markdown 사용 중단 예정·번들 크기·sitemap site 미설정 안내는 이번 타입 오류와 별개다.

## 후속 사용자 요청: 전체 컴포넌트 메뉴

2026-11-05 D122에서 사용자가 모든 지원 계열의 메뉴 노출과 실제 UI·JSON을 요청했다. 위 D117의 ‘현재 계열만 노출’ 선택은 이 요청으로 대체되었다. 66개 계열의 메뉴와 한·영 132개 실행 예제 적용·검증은 [후속 기록](component-previews.md)을 따른다. 앞선 Starlight 타입 오류는 별도 타입 수정 기록에서 해결했으며 후속 문서 타입 검사도 통과했다.
