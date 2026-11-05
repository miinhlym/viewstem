# Viewstem 소비자용 Agent Skill 설계

- 작성자: miinhlym · 작성 지원: Codex
- 날짜: 2026-11-05
- 상태: **초기 가설에 대한 Goldfish 6개 관점 검토를 반영한 설계 제안. 실제 스킬·도구는 미구현이다.**
- 대상: 외부 프로젝트에서 Viewstem을 사용해 앱을 만드는 코딩 에이전트. 사용자가 이 대상을 확인하고 독립 검토 및 설계 구체화를 요청했다.
- 선행 자료: [조사·작업 가설](concepts_brief.md), [Goldfish 통합 보고서](docs/designs/viewstem-skills-review-2026-11-05/goldfish_review_report.md), [읽기 전용 조사 증거](docs/designs/viewstem-skills-inspection-2026-11-05.json).

## 1. 해결 범위와 성공 조건

에이전트가 소비 앱의 설치 상태에서 출발해 필요한 계약을 찾고, Viewstem 정의와 호스트 코드를 작성한 뒤 실제 동작을 확인하도록 돕는다. 첫 사용에는 작은 동작 예제를, 기존 앱 수정에는 변경 부분에 필요한 계약만 제공한다.

완료는 문서 분량이나 스킬 수로 판단하지 않는다. 저장소를 가지고 있지 않은 소비 앱에서 공개 패키지만으로 지정한 작업을 수행하고, 존재하지 않는 API·지원 기능을 만들어내지 않아야 한다. 문서만 제공한 기준선보다 도움이 되는지도 별도로 평가한다.

제품 자체 수정, 실행 중인 앱의 원격 제어 프로토콜, 별도 agent-kit/MCP 서버, Dart/Flutter 실행기, SSR/hydration 지원, 새 CLI 제품은 이번 설계 범위가 아니다. 문서 사이트에는 선택적인 후속 연결점만 제안한다.

## 2. 구성 선택

### 2.1 하나의 진입 스킬과 작업별 자료

권고안은 설치 단위 **`viewstem` 하나**다. 첫 View나 폼 작성은 DSL·renderer·UI 패키지를 함께 사용하므로 패키지마다 스킬을 선택하게 하는 비용이 크다. 대신 본문에서 작업별 참조 자료를 선택한다. 이 권고는 여러 스킬이 항상 나쁘다는 판단이 아니며 평가 결과에 따라 변경할 수 있다.

아래는 구현 단계에서 **Create**할 후보 경로다. 현재 실제 스킬 파일은 만들지 않았다.

```text
skills/viewstem/
  SKILL.md
  agents/openai.yaml
  references/
    setup.md
    definitions.md
    data-actions.md
    svelte-host.md
    svelte-ui.md
    troubleshooting.md
  scripts/inspect-ui.mjs
  integrations/
    codex.md
    claude-code.md
```

**사용자 확정(2026-11-05, D119): Codex와 Claude Code를 처음부터 동등한 지원 대상으로 한다.** 공통 지침은 Agent Skills 형식의 `SKILL.md`와 상대 경로를 사용하며, 라이브러리 계약·예제·작업 흐름·조회 도구를 에이전트별로 복제하지 않는다.

`integrations/codex.md`와 `integrations/claude-code.md`에는 해당 에이전트의 설치·발견·호출·도구 실행 연결에서 실제로 다른 부분만 둔다. 공통 본문은 필요한 경우 현재 에이전트의 자료 하나만 연결한다. `agents/openai.yaml`은 Codex 표시 정보만 담당하며 Claude Code에 대응 파일이 필요하다고 추측하지 않는다. 각 연결 방식은 구현 시 공식 문서와 실제 호스트에서 확인한다. 두 에이전트의 설치·발견·참조 해석·도구 실행 검증을 첫 지원 완료 조건에 포함하며, 공통 포맷을 읽는다는 사실만으로 지원 완료로 보고하지 않는다.

**사용자 확정(2026-11-05, D120): 로컬·클라우드를 구분하지 않고 프로젝트 파일 접근과 Node.js 실행이 가능한 환경을 첫 지원 범위로 한다.** 파일·실행 도구가 없는 대화 환경을 위한 원격 계약 조회 경로는 첫 지원 범위에 포함하지 않는다.

**사용자 확정(2026-11-05, D121): 라이브러리와 스킬은 별도로 설치한다.** 라이브러리 설치가 스킬 설치나 에이전트 설정 변경을 자동으로 수행하지 않으며, 두 가지를 함께 준비하는 통합 설치 흐름은 제공 범위에 포함하지 않는다. 구체적인 호스트별 설치 안내와 호환 버전 관리는 아래 설계에 따라 검증한다.

### 2.2 활성화 계약

스킬은 사용자가 Viewstem 도입·사용을 요청했거나 현재 작업 대상이 Viewstem 코드·정의일 때 적용한다. 단순히 Svelte나 폼을 다룬다는 이유로 활성화하지 않는다. 저장소에 Viewstem 의존성이 있다는 이유만으로 무관한 파일 수정에도 적용하지 않는다.

발견 평가에는 Viewstem 이름을 말하지 않고 기존 Viewstem 파일의 폼 저장을 고치는 요청을 포함한다. 같은 저장소에서 독립적인 일반 Svelte CSS만 고치는 요청은 비활성화 사례로 짝지어 확인한다. 본문을 미리 강제로 읽힌 테스트만으로 자동 발견이 잘된다고 주장하지 않는다.

배포 문구 후보:

```yaml
name: viewstem
description: >-
  Build and debug apps using Viewstem packages and declarative Viewstem
  definitions. Use for Viewstem integration, resource composition, Svelte
  adapters, and Viewstem-provided UI; not for unrelated Svelte work or
  developing the Viewstem library itself.
```

공통 본문과 참조 자료는 영어 한 벌을 관리하고, 사용자 응답 언어는 사용자의 요청을 따른다. 한국어·영어 활성화 요청을 모두 평가한다. 이 설계 문서는 프로젝트 작업 문서이므로 한국어로 유지한다.

### 2.3 본문이 소유하는 흐름

1. 사용자 요청과 실제 수정 대상에서 소비 앱 루트를 정한다. 모노레포라면 대상 앱의 manifest와 설치 경로를 사용한다.
2. 설치 패키지·버전·공개 타입을 확인한다. 아직 설치되지 않았다면 배포 가능한 버전 또는 사용자가 제공한 로컬 tarball이 있는지 확인하며, 현재 저장소의 버전을 npm 발행 사실로 간주하지 않는다.
3. 아래 표에서 관련 자료만 읽고, 필요한 UI 계약은 선택 조회한다.
4. 소비 앱의 기존 구조와 명시 등록·상태·수명 계약에 맞춰 변경한다.
5. 소비 앱의 타입 검사와 해당 동작을 검증하고, 변경·검증·남은 제한을 보고한다. 설명만 요청한 경우 구현하거나 실행하지 않는다.

첫 구현 목표는 짧은 진입 본문이다. 핵심 흐름과 선택표를 유지하고, 특정 작업에서만 필요한 설명은 참조 자료로 옮긴다. 줄 수나 토큰 수 자체를 통과 기준으로 삼지 않는다.

## 3. 참조 자료의 책임

| 자료 | 진입 조건 | 포함할 결정 지침 | 검증할 결과 |
|---|---|---|---|
| `setup.md` | 최초 도입, 패키지 선택, 설치·export 문제 | core 단독과 Svelte 진입점 선택; 실제 설치/로컬 tarball 구분; 기본 UI 없음; 소비 앱 명령 확인 | 최소 View 또는 core 실행이 해당 앱에서 동작 |
| `definitions.md` | View·Component·State·Derived·ports·표현식·when/repeat 작성 | 값과 쓰기 핸들 구분; 명시 입력; ID/key와 수명; 참조와 인라인 중 하나; 지원 CEL 목록 조회 | 등록과 실제 평가를 구분해 연결·반복·상태 변화 확인 |
| `data-actions.md` | Query·Datasource·Variable·Action·URL 연결 | 자동 조회와 명시적 변경 요청 구분; event→Action→State; readiness·오류·취소·refresh; 서버 secret 경계 | 모의 전송으로 성공·실패·늦은 결과를 확인 |
| `svelte-host.md` | mount/attach, 기존 앱 연결, custom adapter | 계약과 구현 등록; read-only inputs·emit·slot; mount와 borrowed View 정리; 완료 신호 구분 | 렌더·이벤트·해제·재연결의 해당 흐름 확인 |
| `svelte-ui.md` | 제공 UI의 선택·조합·스타일 | 필요한 family 등록·CSS; JSON/native 경계; DOM/native payload 차이; controlled State 연결; host 조합 | 입력값이 State와 UI에 왕복하고 필요한 키보드 동작 확인 |
| `troubleshooting.md` | 출력·상태·Query·취소·교체 문제 | 증상→공개 snapshot/진단→최소 재현→관련 계약 순서; 오래된 예제/API 식별 | 같은 재현에서 원인이 제거되고 관련 흐름 유지 |

참조 자료는 문서 전체를 복제하지 않는다. 비자명한 제약, 작업별 판단 순서, 작고 검증된 예제, 추가 근거의 역할을 담는다. 기본 작업에 필수인 설명을 저장소 `docs/` 링크 뒤로만 숨기지 않는다. 다른 개인 스킬을 필수 의존성으로 두지 않으며, Svelte 도구가 실제 제공되는 환경에서는 해당 도구를 활용할 수 있다.

최소 예제는 다음 다섯 흐름으로 제한해 시작한다: core 첫 View, Svelte+UI 첫 mount와 dispose, 입력→State→Action, Query 실패·재조회, custom adapter의 emit/slot. 예제의 필드·반환값은 해당 릴리스 공개 타입으로 검사하고 실행 검증을 연결한다. 데이터는 특정 서비스에 종속되지 않는다.

UI 자료에는 요구를 부품 ID로 연결하는 짧은 발견 표를 둔다. 예를 들어 입력 폼은 field/input/select 계열, 확인 대화상자는 alert-dialog 또는 dialog 계열, 날짜 입력은 date-picker/calendar 계열, 정렬·필터 목록은 data-table 조합에서 시작한다. 이는 선택 후보를 찾는 안내이며 모든 세부 기능 지원을 뜻하지 않는다. 이후 `list`로 실제 ID·mode를 확인하고 `describe`, 필요한 input/event 순으로 좁힌다. 알려진 ID가 있으면 바로 선택 조회하며 같은 발견 절차를 반복하지 않는다.

진단 자료는 다음처럼 증상과 실제 공개 관찰 채널을 연결한다. 이는 새 진단 시스템을 추가하는 제안이 아니다.

| 증상 | 확인할 채널 | 성공으로 오인하지 않을 조건 |
|---|---|---|
| 초기 조회 뒤 데이터 없음 | 완료 보고의 `queryErrors`, `view.getQuery(name).getSnapshot()` | `initialComplete`가 resolve돼도 개별 Query는 실패할 수 있음 |
| 값·노드가 준비되지 않음 | `view.getSnapshot()`, State/Query의 `getSnapshot()` | missing·pending·waiting·error를 빈 성공값으로 바꾸지 않음 |
| 상태는 바뀌었지만 화면 실패 | Svelte `onError`의 phase·error·node, DOM 관찰 | 성공한 core State 쓰기와 renderer 성공은 별개 |
| Store·URL 연동 문제 | `stateStore.getDiagnostics()`, 해당 URL 연결의 진단 | 오류 기록과 실제 URL 반영을 함께 확인 |
| 제거·교체 후 이벤트 실패 | 공개 오류 code, node의 instanceId·generation, 재현 순서 | 오래된 수명의 취소를 현재 노드 오류로 잘못 고치지 않음 |

오류는 공개 `PublicError`의 code·location·input·cause와 관련 식별자를 필요한 범위에서 기록한다. 입력 데이터 전체나 원본 외부 예외 객체를 무조건 출력하는 로깅 절차는 추가하지 않는다. 근거는 [Core 공개 타입](packages/core/src/index.d.ts)과 [Svelte 관찰·수명 계약](packages/svelte/README.md)이다.

## 4. UI 계약 조회 도구

### 4.1 범위 축소

초기 가설의 범용 `inspect.mjs`를 **`inspect-ui.mjs`**로 좁힌다. UI 지원 파일은 조사 시점 약 2.29MB이며, 한 부품의 공유 스키마까지 펼쳐도 Button은 약 45KB다. 반면 CEL 목록은 약 4KB이므로 별도 검색 프로그램 없이 패키지의 지원 파일을 직접 읽는 것으로 시작한다. 이 수치는 파일 크기이며 토큰 사용량이나 성능 개선 측정이 아니다.

도구는 실행 위치와 관계없이 접근 가능한 소비 프로젝트 파일과 Node.js를 사용한다. 현재 패키지의 실행 요건에 맞춰 Node 22 이상과 일반적인 `node_modules` 해석을 대상으로 한다. npm/pnpm의 설치 레이아웃과 workspace symlink를 검증한다. Yarn PnP는 첫 보조 도구의 자동 해석 지원 밖이며, 읽을 수 있는 공개 계약 자료를 이용한다. 이는 라이브러리 사용 자체의 미지원이라는 뜻은 아니다. 프로젝트 파일 접근 또는 Node.js 실행이 불가능한 환경은 D120에 따라 첫 스킬 지원 범위 밖이다. 클라우드 환경이라는 이유만으로 제외하거나 별도 원격 서비스를 요구하지 않는다.

### 4.2 제안 인터페이스

다음은 **구현할 도구의 인터페이스 예시이며 현재 실행 가능한 명령이 아니다.** `<skill-dir>`은 설치된 스킬 위치, `<app-dir>`은 실제 수정 대상 앱이다.

```text
node <skill-dir>/scripts/inspect-ui.mjs --project <app-dir> list [--family <slug>] [--offset <n>] [--limit <n>]
node <skill-dir>/scripts/inspect-ui.mjs --project <app-dir> describe <component-id>
node <skill-dir>/scripts/inspect-ui.mjs --project <app-dir> input <component-id> <input-name>
node <skill-dir>/scripts/inspect-ui.mjs --project <app-dir> event <component-id> <event-name>
```

`list`는 ID·family·mode만 반환한다. ID 오름차순으로 정렬하고 기본 limit 20, 허용 범위 1–100, offset은 0 이상의 정수로 한다. `describe`는 mode·slots·제약·필수 입력명·입력/이벤트 이름을 제공하며 전체 스키마를 펼치지 않는다. `input`과 `event`만 요청한 항목의 스키마와 codec 등 원본 메타데이터를 반환한다.

선택된 항목은 `propertiesRef`, `callbacksRef`, `unsupportedRef`를 같은 지원 파일에서 해석한다. `uncertain:true`, `schema:true`, codec, required와 제한 설명을 임의로 정리해 없애지 않는다. 지원 파일 조회는 Registry 등록이나 실제 런타임·DOM 적합성 검사와 다르다.

입력·이벤트 이름이 지원 목록에는 없지만 `unsupportedRef`의 목록에 있으면, 단순히 없다고 답하지 않고 `UNSUPPORTED_MEMBER`와 원본 제한 이유를 반환한다. 이 목록에 있다는 사실만으로 같은 이름의 native API 사용이 가능하다고 보장하지 않는다. 일반적인 `describe`에는 미지원 목록의 개수와 원본 Pointer만 포함하고 수백 개 항목을 모두 펼치지 않는다.

native-context 부품은 `describe`로 이유와 공개 family 경로를 보여준다. `input`·`event`로 JSON 계약을 요청하면 `NATIVE_ONLY`를 반환하고 native 조합 안내로 연결한다. 존재하지 않는 JSON ID를 만들어내지 않는다. native export의 실제 심볼명은 해당 공개 타입에서 확인하며 ID에서 자동으로 추측하지 않는다.

### 4.3 출력과 payload 의미

stdout은 JSON 한 객체, stderr는 보조 실행 오류로 구분한다. 성공 출력에는 `outputVersion:1`, `ok:true`, `source`와 `result`를 둔다. `source`는 패키지명·실제 버전·지원 파일 경로·`formatVersion`·SHA-256을 담는다. SHA-256은 읽은 자료의 식별자이며, 그 자체로 릴리스 호환성을 인증하지 않는다.

결과에는 사용한 `component-id`, 참조 키, 원본 JSON Pointer와 `scope`를 함께 둔다. `scope`는 `summary`, `selected-input`, `selected-event` 중 하나이며 선택하지 않은 계약까지 검사했다고 표현하지 않는다. 도구를 쓰지 않고 직접 조회할 때도 필요한 ID·자료 위치·버전·선택 범위를 남긴다.

`event` 결과에는 원본 callback 스키마와 JSON 전달 형태를 구별한다. `codec:"dom"`이면 스키마가 payload 자체를 설명한다. 다른 callback은 인자 스키마를 `{value: ...}` 안에 넣는 전달 형태를 명시한다. raw 스키마를 payload 스키마라고 잘못 이름 붙이지 않는다. 예를 들어 `Select.Root.valueChange`의 값과 `Input.input`의 DOM 이벤트는 모두 `value`가 보이더라도 원본 계약이 다르다.

list 결과에 `total`, `offset`, `nextOffset`을 포함한다. 출력 한도는 UTF-8 16KiB로 제안한다. 초과 시 스키마를 잘라 성공으로 반환하지 않고 `OUTPUT_TOO_LARGE`와 자료 경로·JSON Pointer·필요한 바이트 수를 반환해 해당 부분을 직접 읽게 한다. 한도는 실측 후 조정 가능한 출력 정책이며 라이브러리 계약이 아니다.

### 4.4 해석·실패 경계

소비 앱의 `package.json`을 기준으로 Node의 `createRequire(...).resolve('@viewstem/svelte-ui/shadcn/support.json')`로 공개 JSON 경로를 찾는다. JavaScript 모듈을 import하거나 소비 앱 코드를 실행하지 않는다. 패키지 버전은 해석한 파일의 패키지 경계에서 manifest의 `name`을 확인한 뒤 읽는다. `@viewstem/core/package.json` 같은 비공개 subpath import에 의존하지 않는다.

현재 UI 지원 파일 `formatVersion`은 1이다. 첫 parser는 형식 1과 필요한 필드 구조를 확인한다. 알 수 없는 formatVersion·빠진 참조·잘못된 JSON·중복 ID·알 수 없는 mode는 데이터 오류로 보고 추측해 이어가지 않는다. 예상치 못한 새 의미를 조용히 현재 형식으로 처리하지 않는다.

| 상황 | 코드·처리 |
|---|---|
| 잘못된 인자·project 없음·잘못된 pagination | `INVALID_ARGUMENT`, exit 2 |
| 대상 앱에서 패키지를 찾을 수 없음 | `PACKAGE_NOT_FOUND`, exit 1; 자동 설치 없음 |
| 패키지 형식/해석을 지원하지 않음 | `UNSUPPORTED_FORMAT` 또는 `RESOLUTION_UNSUPPORTED`, exit 1 |
| JSON·참조·mode가 손상됨 | `INVALID_SUPPORT_DATA`, exit 1 |
| 없는 family·ID·입력·이벤트 | `NOT_FOUND`, exit 1; 찾지 못한 정확한 항목 명시 |
| 미지원 목록에 존재하는 입력·이벤트 | `UNSUPPORTED_MEMBER`, exit 1; 원본 이유와 지원되는 native API 또는 대체 패턴의 확인 경로 제공 |
| native 전용 부품의 JSON 계약 요청 | `NATIVE_ONLY`, exit 1; native 경로 안내 |
| 결과가 출력 한도를 초과함 | `OUTPUT_TOO_LARGE`, exit 1; 직접 조회할 위치 제공 |

에러 출력은 `{outputVersion:1,ok:false,error:{code,message,nextStep,...}}`로 통일한다. 공개 자료 조회 실패를 앱 오류로 표시하지 않는다. 도구는 네트워크·의존성 설치·소비 앱 쓰기·Query 실행·환경변수 수집을 하지 않는다.

## 5. 문서와 버전의 일치

### 5.1 자료별 책임

| 자료 | 책임 |
|---|---|
| 소비 앱에 설치된 package manifest·공개 타입 | 실제 버전, 공개 import와 JS/TS 시그니처 |
| 해당 패키지 UI/CEL 지원 JSON | 그 산출물이 선언하는 지원 목록·codec·제약 |
| 스킬의 참조 자료 | 작업별 판단, 연결 순서, 검증된 최소 예제 |
| 해당 revision의 프로젝트 명세·공개 문서 | 의미 계약과 상세 설명 |
| 릴리스 검증 증거 | 무엇을 어떤 버전·환경에서 실제 실행했는지 |

설치 버전과 다른 최신 문서로 자동 이동하지 않는다. 계약과 관찰 결과가 다르면 양쪽 근거를 남기고, 현재 요청을 해결할 수 있는 공개 API의 우회 경로가 있는지 확인한다. 재현하지 않은 제한을 사실로 확정하거나 문서 전체를 무효로 취급하지 않는다.

지원 JSON에 없는 실행·수명·CSS·조합 제약을 보조 도구에서 새로 추론하지 않는다. 그런 설명은 대응 버전의 참조 자료와 문서에서 읽는다. 예를 들어 `slots.child`의 자식 제한과 portal의 테마 적용 범위는 [UI README](packages/svelte-ui/README.md)의 조합·스타일 계약을 따라야 한다. 관리 원본의 상세 근거는 [명세 지도](docs/README.md), [공개 타입](packages/core/src/index.d.ts), [현재 UI 지원 데이터](packages/svelte-ui/src/lib/shadcn/support.json), [CEL 목록](packages/core/src/cel/supported-functions.json)이다. 배포 스킬은 이 저장소 상대 경로를 소비 앱의 필수 경로로 복사하지 않는다.

### 5.2 배포와 외부 소비

관리 원본은 저장소 `skills/viewstem/`, 배포 단위도 그 폴더로 한다. 실행에 필요한 파일은 폴더 안의 상대 경로로 완결돼야 한다. 라이브러리 npm 패키지에 스킬을 자동 설치하거나 사용자의 전역 설정을 바꾸지 않는다.

D121에 따라 스킬은 라이브러리와 별도로 명시 설치한다. Codex와 Claude Code 모두 동일한 공통 스킬 revision을 배포하고, 호스트별 설치·발견 방식만 각 integration 자료에서 안내한다. Codex에서는 내장 skill-installer의 **GitHub repo + path + ref** 입력을 활용할 수 있으며, Claude Code의 구체적인 설치 경로·방법은 공식 지원 방식과 실제 호스트에서 검증한다. 공개 릴리스 이후 `miinhlym/viewstem`, `skills/viewstem`, 검증된 immutable ref를 안내한다. 실제 파일이 공개되기 전에는 설치 가능한 URL·명령으로 홍보하지 않는다. 한 에이전트만 검증한 상태를 첫 지원 완료로 발표하지 않는다.

첫 구현은 필요한 최소 의미 설명과 예제를 스킬에 함께 제공하므로 저장소 clone이나 문서 사이트 접근을 기본 작업의 전제로 만들지 않는다. 상세 사이트 링크는 보조 자료다. `llms.txt`나 Markdown endpoint가 생기면 작업 자료 탐색에 활용할 수 있지만 스킬의 필수 선행 개발은 아니다.

지원 버전 표는 `setup.md`가 소유한다. 첫 릴리스는 실제 소비 평가를 통과한 **정확한 패키지 버전 조합**을 기록한다. 테스트하지 않은 semver 범위를 임의로 지원한다고 적지 않는다. 현재처럼 같은 `0.1.0`으로 변경 중인 로컬 산출물은 별도 개발 검증으로 보고 대응 revision·자료 hash를 기록한다. 버전이 다르면 일반 지침은 사용할 수 있으나 구체 API·예제 적용은 설치된 계약을 확인해야 한다.

기존 개인 설치를 자동 덮어쓰지 않는다. 업데이트·되돌리기는 호스트 설치 도구가 지원하는 명시적인 ref 선택과 교체 절차로 안내한다. 소비 앱의 라이브러리 버전은 스킬 업데이트 때문에 변경하지 않는다.

자료 유지 책임은 Viewstem 패키지 변경 담당자에게 둔다. 공개 타입·지원 JSON·등록/수명 계약 또는 대응 문서가 바뀌면 관련 스킬 자료와 예제만 재검토한다. 지원 목록을 수동 복제하지 않으며, 동작 설명은 관리 근거와 연결한 예제로 검증한다. 스킬 릴리스 점검은 형식 검사만이 아니라 해당 버전 표의 소비 검증 증거를 확인해야 한다. 미검증 버전은 표를 넓히지 않는다.

## 6. 검증과 배포 판단

### 6.1 정적·도구 검증

스킬 frontmatter, 배포 폴더 내부 링크, 다른 스킬·저장소 파일에 대한 필수 의존 부재를 확인한다. 샘플 코드의 공개 타입 검사와 핵심 동작 검증을 묶는다. 형식 검사를 통과한 사실은 행동 개선 증거가 아니다.

UI 조회 도구는 실제 지원 JSON을 사용하는 성공 사례와 작은 오류 fixture를 함께 검사한다. 입력/이벤트 하나를 추출해 원본과 비교하고, DOM/native payload·required·uncertain 보존, native 전용 거절, 미설치·잘못된 형식·끊긴 참조·중복 ID·다른 앱 경로·출력 한도·pagination을 확인한다. 실행 중 소비 앱 파일 hash가 바뀌지 않는지도 검사한다. 모든 런타임·브라우저 테스트를 매번 재실행하는 대신 변경 경계를 따른다.

외부 소비 검증은 저장소 밖 임시 디렉터리에 실제 패키지 tarball과 배포 스킬만 놓고 실행한다. 저장소의 `src/`, `test/fixtures/`, `docs/` 접근으로 누락 자료를 보충하지 못하도록 한다. 기존 tarball 소비 테스트의 검증 방법은 참고하되 그 스크립트를 소비자에게 요구하지 않는다. Codex와 Claude Code에서 동일한 공통 산출물을 각각 발견·호출하고 상대 참조와 도구 실행을 확인한다. 결과는 호스트별로 구분하며 한쪽의 통과를 다른 쪽의 증거로 재사용하지 않는다.

### 6.2 행동 평가

구성 요소를 한꺼번에 추가한 비교만으로 각 파일과 도구의 필요성을 판단하지 않는다. 먼저 다음 순서로 작은 비교를 한다. 전체 조합을 모두 평가할 필요는 없다.

1. A: 같은 패키지·공개 문서·일반 도구만 제공한다.
2. B: A에 짧은 진입 지침을 추가한다. 이 단계에서 충분히 해결되는 작업에는 추가 절차를 요구하지 않는다.
3. C: B에서 나타난 실패나 반복 탐색에 대응하는 작업 자료를 추가한다. 위 6개 자료는 책임 지도이며, 파일 수 자체가 완료 조건은 아니다.
4. D: UI 계약 조회에서 반복 오류·출력 비용이 확인되면 `inspect-ui.mjs`를 추가해 해당 UI 작업에서 C와 비교한다. 2.29MB와 부품별 출력 크기는 도구 후보의 근거이지 행동 개선 증거가 아니다.

초기 작은 비교는 첫 View, 폼 연결, native 전용 UI 선택의 세 작업을 대상으로 각 조건을 1회 실행해 실패 지점을 찾는다. 개선 방향이 정해지면 아래 전체 시나리오에서 A와 최종 후보를 arm당 3회 비교한다. 매 실행은 새 대화·초기 앱 snapshot에서 시작한다. 같은 모델·설정·시간/도구 예산을 사용하며 기대 답이나 이전 실패를 에이전트에게 제공하지 않는다. 판정자는 실제 산출물과 실행 결과를 확인한다.

| 시나리오 | 반드시 관찰할 결과 |
|---|---|
| 기존 Svelte 앱에 첫 View | 화면 출력, 필요한 UI·CSS 명시 등록, 소유 자원 해제 |
| 폼 입력→저장 Action→재조회 | payload와 State 왕복, 성공/실패 구분, 필요한 Query 갱신 |
| core 단독 소비 | DOM/Svelte 추가 없이 공개 API로 동작 |
| 반복 목록 정렬·필터 | 안정 key의 상태 유지, 제거 수명의 오래된 이벤트 차단 |
| native 전용 UI 요구 | 지원 여부 확인 후 호스트 조합, 가짜 JSON ID 없음 |
| 완료 신호 진단 | 초기 Query 완료·DOM 반영·paint 구분; resolve된 완료 보고의 queryErrors 탐지 |
| core 성공·renderer 실패 | 성공한 State 쓰기를 유지하면서 onError와 실제 DOM 실패를 진단 |
| 늦은 응답·View 교체 | 오래된 실행이 현재 화면 상태를 덮어쓰지 않음 |
| 버전 불일치·미지원 기능 | 불일치 식별, 미검증 지원 약속·없는 API 생성 없음 |
| 일반 Svelte·다른 라이브러리 작업 | Viewstem 스킬의 불필요한 개입 없음 |

언어는 각 A/B 쌍에서 동일하게 유지하고 한국어·영어 요청을 모두 포함한다. 작은 표본의 방향성 자료로 보고 일반 성능을 주장하지 않는다. 성공률뿐 아니라 사용자 개입, 잘못된 API, 불필요한 읽기·도구 호출, wall time과 실제 측정 가능한 토큰을 기록한다. 토큰을 측정할 수 없으면 파일 바이트를 토큰이라고 대체하지 않는다. 평가 결과에는 추가한 구성 요소와 해결하려던 관찰 실패를 함께 기록한다.

선행 통과 기준은 실제 지원 범위에서 동작하는 산출물, 비밀값의 클라이언트 이동 없음, 작업 범위의 무단 확장 없음, native-only 오안내 없음이다. 실패 사례를 수정·재평가하기 전 일반 배포 준비 완료로 보고하지 않는다. A가 이미 잘하는 작업에서 B가 읽기와 절차만 늘리면 본문·자료를 줄인다. 단일 스킬의 참조 누락이 반복되고 단순화로 해결되지 않을 때만 분리안과 재비교한다.

## 7. 구현 단계와 작업 경계

| 단계 | Create/Modify 범위 | 완료 기준 |
|---|---|---|
| 1. 최소 스킬과 기준선 | Create `skills/viewstem/SKILL.md`, `agents/openai.yaml`; Create 필요한 작업 자료를 위 6개 `references/*.md` 경계 안에서; Create `skills/tests/scenarios.md` | 얇은 지침부터 비교하고, 관찰 실패를 해결하는 자료와 실행 예제를 보강; 활성화/비활성화 판정 기준 확보 |
| 2. UI 선택 조회 | Create `skills/viewstem/scripts/inspect-ui.mjs`, `skills/tests/inspect-ui.test.mjs` | 문서의 도구 계약·오류·원본 메타데이터 보존 검사 통과 |
| 3. 독립 소비·행동 평가 | Create `skills/tests/consumer.mjs`, `skills/tests/behavior-results.json`; 필요 시 스킬 내용 수정 | 저장소 없는 환경에서 실제 실행, A/B 실패와 비용 기록, 문구·예제 보정 |
| 4. 배포 연결 | Modify 지원 버전 표; 승인된 배포 방식에 필요한 안내만 추가 | 정확한 공개 ref, 설치·되돌리기 안내, 선언한 호스트에서 발견·실행 확인 |

위 상대 경로의 `agents/`, `references/`, `integrations/`는 `skills/viewstem/` 아래다. 1단계에는 `integrations/codex.md`와 `integrations/claude-code.md`를 Create하고 호스트별 차이만 기록한다. 테스트 파일은 설치 스킬 밖에 둔다. 결과 JSON은 실행 당시 호스트·모델·입력·패키지·소스 식별과 미실행 항목을 기록한다. 행동 평가는 각 호스트 안에서 A/B를 비교하며 서로 다른 모델·호스트 간 결과를 스킬 효과로 비교하지 않는다. 새 npm 의존성·제품 공개 API 변경·문서 사이트 변경·CI 파일 변경은 이 표의 암묵 범위에 포함하지 않는다. CI 연결은 실제 검사 명령이 안정된 뒤 별도 명시 변경으로 다룬다.

## 8. 독립 검토 반영과 결정 근거

[통합 보고서](docs/designs/viewstem-skills-review-2026-11-05/goldfish_review_report.md)의 입력은 [초기 가설 snapshot](docs/designs/viewstem-skills-review-2026-11-05/review_input_snapshot.md)이다. design·codebase-details·zoom-out·comprehension·implementation-readiness·structural 6개 검토자가 모두 실제 최종 응답을 반환했다. 실패·재시도·미실행은 없었다. 원시 합계는 Blocker 0 / Major 3 / Nit 7, 중복 통합 후 Blocker 0 / Major 2 / Nit 5다. 이는 초기 개념의 검토 결과이며 현재 상세 설계나 구현이 독립 실행 검증을 통과했다는 뜻은 아니다.

| 통합 발견 | 이 설계의 처리 | 남은 확인 |
|---|---|---|
| Major: 부품 ID 하나의 계약도 큰 출력 | §4의 summary·단일 input/event 조회, 16KiB 한도와 손실 없는 직접 접근; UI 전용 도구로 축소 | 실제 출력·누락·작업 성공의 동시 측정 |
| Major: 묶음 비교로 구성별 필요성 판별 불가 | §6.2의 문서→얇은 지침→필요 자료→UI 조회 순 비교 | 실제 관찰 실패를 근거로 파일과 절차 유지/삭제 |
| Nit: 진단 채널이 성공 판정에 연결되지 않음 | §3의 증상별 공개 채널, §6의 Query 실패·renderer 실패 사례 | 모의 전송과 브라우저 재현 |
| Nit: 조회 출처·부분 범위 추적 부족 | §4.3의 source·hash·참조·Pointer·scope | 도구와 수동 조회의 재현 가능성 |
| Nit: 요구에서 부품 ID를 발견하는 경로 부족 | §3의 요구→계열→mode→선택 계약 흐름 | 이름을 모르는 UI 요구의 성공 여부 |
| Nit: 이름을 말하지 않은 기존 앱 요청 평가 부족 | §2.2의 암묵 긍정/무관한 작업 부정 사례 | 호스트의 실제 자동 발견 |
| Nit: 원본 메타데이터와 파생 설명의 경계 | §4의 codec·uncertain 보존과 payload 형태 구분, §5의 메타데이터 밖 계약 연결 | 실제 원본과 출력의 일치, 버전별 소비 검증 |

검토에서 제안된 사항을 모두 새 시스템으로 구현하지는 않는다. 별도 검색 서비스·중앙 telemetry·범용 CEL 조회기·전체 지원 목록 복제는 추가하지 않는다. 6개 참조 자료는 책임을 구분하는 지도이며, 행동 평가 없이 모든 파일의 필요성이 입증됐다고 보지 않는다.

문서만 제공하는 안은 기준선으로 유지한다. 단일 스킬은 여러 패키지를 연결하는 작업 흐름과 설치 단순성 때문에 현재 권고한다. 패키지별 3개 스킬은 사용자의 독립 진입 패턴과 행동 평가에서 필요가 입증될 때 검토한다. 리소스·컴포넌트별 세분화는 현재 필요성이 없다.

## 9. 이번 작업의 검증과 남은 경계

현재 패키지에서 UI·CEL 공개 JSON 경로의 읽기 전용 해석을 확인했고, 메타데이터 크기·mode·required·uncertain의 실제 형태를 확인했다. 조회는 기존 workspace의 `apps/docs`를 기준으로 했으므로 독립 소비 설치 검증으로 확대하지 않는다. 근거 파일 hash와 조사 한계는 [조사 기록](docs/designs/viewstem-skills-inspection-2026-11-05.json)에 있다.

Goldfish는 `fork_turns:none`으로 부모 대화를 전달받지 않았다. 공유 파일시스템과 호스트의 프로젝트 지침까지 격리됐다는 보장은 하지 않는다. 원문 해시·persona·읽은 파일·각 완료 보고는 [검토 폴더](docs/designs/viewstem-skills-review-2026-11-05/README.md)에 보존했다.

구현·행동 평가·실제 외부 설치는 아직 수행하지 않았다. 공개 릴리스 ref와 검증한 패키지 조합은 실제 배포물로 확인해야 하며 이 설계가 발행 상태를 대신하지 않는다. 그 값의 부재는 설계 중단 사유가 아니라 구현·배포 단계의 완료 조건이다. 제품 코드는 변경하지 않았다. 사용자 확정인 두 에이전트의 첫 지원·공통 구조·차이 분리, 파일 접근·Node.js 실행 기준의 환경 범위, 라이브러리와 스킬의 별도 설치는 [현재 명세](docs/VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)와 [D119–D121](docs/history/decision-register.md)에 기록했다. 나머지 설계 제안의 일괄 승인을 뜻하지 않는다.
