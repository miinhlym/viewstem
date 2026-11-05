# Viewstem 소비자용 Agent Skills — 조사와 작업 가설

- 작성자: miinhlym · 작성 지원: Codex
- 날짜: 2026-11-05
- 상태: **초기 가설의 조사 기록. 사용자 범위 확인과 Goldfish 6개 관점 검토 완료.**
- 범위: 라이브러리를 사용하는 에이전트를 위한 스킬 구성 설계. 실제 스킬 구현·설치·발행과 제품 코드 변경은 수행하지 않았다.
- 작업 기준: 현재 작업 트리. 문서 사이트 작업의 기존 변경은 보존한다. 이 문서는 확정 명세나 새 제품 결정이 아니다.

**최신 구성과 구체적인 계약은 [검토를 반영한 설계](design_draft.md)를 따른다.** 아래 1–7절은 검토에 사용한 초기 가설의 배경을 보존한다. 실제 검토 당시의 변경 없는 입력과 해시는 [원문 snapshot](docs/designs/viewstem-skills-review-2026-11-05/review_input_snapshot.md)에 있다. 사용자는 외부 앱을 만드는 코딩 에이전트라는 대상을 확인했고, 독립 검토 및 결과를 반영한 설계 구체화를 요청했다.

후속 사용자 결정 D119: Codex와 Claude Code를 처음부터 지원하며 공통 스킬을 유지하고 에이전트별 차이만 분리한다. 이 결정은 [현재 명세](docs/VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)와 [결정 등록부](docs/history/decision-register.md)에 반영했다. 아래 EGM 원문 검토의 범위·시점과 구별한다.

후속 사용자 결정 D120: 로컬·클라우드를 구분하지 않고 프로젝트 파일 접근과 Node.js 실행이 가능한 환경을 첫 지원 범위로 한다.

후속 사용자 결정 D121: 라이브러리와 스킬을 별도로 설치한다. 두 가지를 함께 준비하는 통합 설치 흐름은 제공 범위에서 제외한다.

## 1. 해결하려는 문제와 작업 가설

에이전트가 Viewstem을 사용하는 앱을 만들 때, 어떤 패키지와 공개 API를 쓰고 어떤 JSON을 작성해야 하는지 적은 탐색으로 판단할 수 있어야 한다. 코드를 생성하는 데서 끝나지 않고 실제 입력·이벤트·상태·화면 수명을 검증할 수 있어야 한다.

**1차 대상은 외부 소비 프로젝트에서 작업하는 코딩 에이전트로 가정한다.** 이미 실행 중인 서비스에 원격으로 접속해 화면을 조작하는 에이전트용 도구/API는 별도 범위다. 후자는 호스트의 연결·권한 계약이 필요하며, SKILL.md를 배포하는 것만으로 제공되지 않는다. Viewstem 자체 개발자를 위한 저장소 작업 절차도 소비자용 스킬의 기본 흐름에 섞지 않는다.

작업 가설은 **사용자가 설치하는 `viewstem` 스킬 하나 + 작업별 참조 자료 + 필요한 계약만 읽는 보조 도구**다. 패키지 수나 7종 리소스 수에 맞춰 스킬을 먼저 나누지 않는다. 이 구성이 충분한지는 문서만 제공한 경우와 실제 작업 결과를 비교해 판단한다.

## 2. 조사한 설치 스킬과 적용할 점

설치된 스킬의 구조와 지침을 비교했다. 해당 스킬을 실행 평가하거나 파일을 Viewstem에 복제한 것은 아니다. 아래 절대 경로는 이번 조사 근거이며 배포 스킬에 포함할 의존 경로가 아니다.

| 사례 | 확인한 방식 | Viewstem에 적용할 점 | 그대로 가져오지 않을 점 |
|---|---|---|---|
| [skill-creator](/Users/minholim/.codex/skills/.system/skill-creator/SKILL.md) | 진입 설명, 본문, 참조 자료를 단계적으로 읽고 실제 작업으로 효과 검증 | 작업을 바꾸는 정보와 흔한 계약 오류에 집중 | 문서 복사본, 목적 없는 디렉터리, 모든 작업의 강제 리뷰 |
| [pixijs](/Users/minholim/.agents/skills/pixijs/SKILL.md), [pixijs-events](/Users/minholim/.agents/skills/pixijs-events/SKILL.md) | 진입 스킬이 다수의 세부 스킬로 연결; 각 세부 스킬에 예제와 주의점 | 작업별 진입 조건과 찾을 수 없는 API의 후속 탐색 경로 | 초기부터 세부 API마다 스킬 분리; 버전 확인 없는 최신 문서 사용 |
| [shadcn-svelte](/Users/minholim/.agents/skills/shadcn-svelte/SKILL.md) | 프로젝트 설정 확인 후 조합·폼·스타일 등 규칙 자료 선택 | 소비 프로젝트의 설정과 이미 설치된 기능부터 확인 | Viewstem UI에 일반 shadcn CLI 설치 흐름을 강제하거나 native 예제를 JSON 문법으로 변환 |
| [svelte-code-writer](/Users/minholim/.agents/skills/svelte-code-writer/SKILL.md) | 문서 검색과 코드 분석 도구를 작업 흐름에 연결 | 설명과 실행 가능한 확인 수단을 연결 | 모든 호스트에 동일한 MCP·다른 개인 스킬이 설치돼 있다고 가정 |
| [evaluate-skill](/Users/minholim/.codex/plugins/cache/openai-curated-remote/plugin-eval/0.1.2/skills/evaluate-skill/SKILL.md) | 구조 분석과 실제 사용량·행동 평가를 구분 | 형식 유효성과 작업 성공을 별도로 측정 | 정적 점수만으로 에이전트 사용성을 입증했다고 보고 |

[Agent Skills 형식](https://agentskills.io/specification)은 필수 `SKILL.md`와 선택적인 `references/`, `scripts/`, `assets/` 구조를 정의한다. 공통 지침은 이 형식을 따르고 호스트별 메타데이터는 분리하는 안이다. [작성 지침](https://agentskills.io/skill-creation/best-practices)의 필요한 정보만 단계적으로 읽기와 실제 작업을 통한 개선 원칙도 참고했다. 형식을 따른다고 모든 에이전트 제품의 발견·설치·실행 호환성이 검증되는 것은 아니다.

## 3. 현재 프로젝트에서 확인한 사실

| 근거 | 설계에 미치는 영향 |
|---|---|
| [Core README](packages/core/README.md), [공개 타입](packages/core/src/index.d.ts) | Core는 DOM 독립 실행기다. 실제 생성 API와 공개 메서드를 사용하며 과거 생성자·내부 엔진 API를 재사용하지 않는다. |
| [Svelte README](packages/svelte/README.md) | Svelte 앱은 `createRenderer`로 시작한다. 기본 UI는 없고 명시 등록이 필요하다. 소유 View와 빌린 View의 정리 책임, core 완료와 DOM 반영 완료를 구분한다. |
| [Svelte UI README](packages/svelte-ui/README.md) | JSON 지원 부품과 native 문맥 전용 부품, DOM 이벤트와 value callback의 payload가 다르다. 일반 shadcn 사용법만으로 Viewstem 조합을 작성할 수 없다. |
| [UI support.json](packages/svelte-ui/src/lib/shadcn/support.json) | 조사 시점 파일은 2,287,077 bytes, 392개 항목이다. 351개 upstream JSON 부품 + 6개 조합 + 35개 native 전용 항목이 함께 들어 있다. 전체를 프롬프트에 넣기보다 ID별 계약을 추출할 근거가 있다. |
| [CEL 지원 목록](packages/core/src/cel/supported-functions.json) | 표준 CEL의 모든 기능을 가정하지 않고 해당 패키지가 제공하는 함수·제외 목록을 조회할 수 있다. |
| 사이트 패키지 문서 인계: `docs/handoff/docs-package-reference-2026-11-05.md` (별도 사이트 작업의 조사 경로) | 가이드·DSL·공개 API·UI 계열 문서가 구성돼 있다. 스킬에서 같은 설명을 새로 관리하기보다 작업에 맞는 근거로 연결할 수 있다. |
| 같은 인계의 `발견한 기존 명세/구현 차이` 절 (별도 사이트 작업의 조사 경로) | Action 단계 inputs 생략, 유지되는 Query use의 설정 병합, State/Derived의 경로 제한에 차이가 기록돼 있다. 문서 또는 구현 하나가 항상 무조건 우선한다고 단순화하면 안 된다. |
| [후속 범위](docs/handoff/open-contracts.md#실제-남은-작업) | 공개 npm 발행, Dart/Flutter, SSR/hydration 등의 상태를 구분해야 한다. 로컬 패키지 검증을 원격 발행·지원 완료로 표현하지 않는다. |

정확한 JS/TS 시그니처는 설치된 패키지의 공개 타입, UI·CEL 가능 범위는 해당 패키지의 지원 메타데이터, 의미 계약은 대응 revision의 명세에서 확인한다. 충돌이 발견되면 양쪽 근거와 실제 재현을 기록하고 계약을 조용히 바꾸지 않는다. 현재 알려진 차이를 모든 버전의 영구 규칙으로 복제하지 않는다.

## 4. 제안하는 첫 구성

다음은 생성된 파일 목록이 아닌 **설계 후보**다. 실제 참조 자료는 필요한 내용이 확보된 것만 만든다.

```text
skills/viewstem/
  SKILL.md
  references/
    setup.md
    definitions.md
    data-actions.md
    svelte-host.md
    svelte-ui.md
    troubleshooting.md
  scripts/
    inspect.mjs
```

### 진입 스킬

`description`은 Viewstem 패키지 사용, Viewstem JSON 정의 작성·수정, Viewstem 연동 문제 해결을 식별한다. 단순한 “폼 만들기”, “Svelte”, “Query”만으로 활성화되는 넓은 설명은 피한다. Viewstem을 선택하지 않은 앱에 라이브러리를 도입하는 근거로 사용하지 않는다.

본문에는 작업 대상·설치 버전 확인, 참조 자료 선택표, 자주 틀리는 공통 경계, 결과 검증 흐름만 둔다. 작은 수정은 필요한 자료로 바로 들어가며 모든 문서를 순서대로 읽거나 매번 아키텍처를 다시 계획하게 하지 않는다.

| 자료 | 읽는 조건 | 책임과 필요한 관찰 결과 |
|---|---|---|
| `setup.md` | 최초 도입, 패키지 선택, 설치 문제, core 단독 사용 | 실제 설치·버전·export를 확인하고 가장 작은 실행 흐름을 만든다. 소비 앱의 패키지 관리자와 검사 명령을 사용한다. |
| `definitions.md` | View/Component, State/Derived, ports, 표현식, when/repeat 작성 | 값과 핸들, 작성자 문맥과 명시 입력, 인스턴스 ID와 반복 key를 구분한다. 등록·실제 평가의 서로 다른 검증 범위를 설명한다. |
| `data-actions.md` | Query/Datasource/Variable, 이벤트 Action, URL 연결 | 입력→조회→상태→동작의 연결, readiness·실패·취소·재조회 의미를 다룬다. secret 실행은 서버 경계에 둔다. |
| `svelte-host.md` | 마운트, 기존 앱 연결, custom adapter, 정리 문제 | Component 계약과 구현의 등록, `emit`·slot, mount/attach 소유권, 완료 신호를 연결한다. |
| `svelte-ui.md` | 제공 UI로 폼·테이블·대화상자 등 구성 | 필요한 계열의 등록·CSS·정확한 input/event/slot 계약을 확인한다. JSON으로 안 되는 요구는 공개 native 조합 또는 호스트 어댑터로 연결한다. |
| `troubleshooting.md` | 출력 누락, 값 미변경, stale 결과, 취소·교체 오류 | 증상에 맞는 snapshot·진단·최소 재현을 수집한다. 정의·입력·수명·renderer 중 실패 경계를 좁히고 해당 흐름을 다시 검증한다. |

첫 버전에는 생성기·전체 앱 템플릿·별도 MCP 서버를 기본 포함하지 않는 안이다. 실행 예제가 반복해서 필요하면 이미 검증하는 예제에서 추출하고, 필요가 입증된 템플릿만 나중에 포함한다.

### 보조 도구 후보

`inspect.mjs`는 실제 설치된 패키지를 기준으로 버전·공개 진입점과 선택한 UI 부품의 `mode`, 입력 스키마, 이벤트 payload, slots, 제한을 읽는 도구다. `propertiesRef`·`callbacksRef`·`unsupportedRef`가 가리키는 정보까지 함께 반환해야 한다. CEL도 같은 방식으로 지원 여부를 좁혀 조회할 수 있다.

이 이름과 인터페이스는 제안이며 현재 존재하는 Viewstem CLI가 아니다. 소비 프로젝트 경로를 명시적으로 받으며 스킬 설치 폴더를 앱 루트로 착각하지 않아야 한다. 패키지의 공개 파일만 읽고 앱 코드를 실행하거나 의존성을 설치하지 않는다. 미설치·알 수 없는 ID·지원 형식 불일치를 구분해 보고하며 필요하면 직접 파일 탐색으로 대체한다.

스키마나 지원 목록을 손으로 다시 만들지 않는다. 검증을 위해 실제 View를 만들면 Query가 실행될 수 있으므로, 단순 조회·등록 확인과 모의 전송을 사용하는 실행 검증을 구분한다. 별도 DSL validator를 새로 구현하는 안은 우선 제외한다.

## 5. 문서·버전·배포의 연결

문서는 계약과 사용법을 설명하고, 스킬은 지금 작업에서 무엇을 찾고 어떻게 적용·검증할지 안내한다. 참조 자료는 짧은 작업 지침과 근거 연결을 유지하고 전체 API 설명을 복제하지 않는다.

- 외부 소비자는 저장소의 `docs/`, `test/fixtures/`, 비공개 원문을 가지고 있다고 가정할 수 없다. 설치된 공개 타입·README·지원 JSON을 먼저 활용한다.
- 상세 설명은 대응 revision의 공개 문서 또는 배포에 포함한 검증된 최소 자료로 해결한다. 설치 버전과 다른 최신 문서에 조용히 의존하지 않는다. 오프라인 동작을 보장하려면 필요한 최소 설명을 실제 배포에 포함하고 별도로 검사해야 한다.
- 문서 사이트의 Markdown 배포·`llms.txt`는 탐색을 돕는 후속 통합 후보다. 현재 공개 제공 사실로 간주하거나 기존 사이트 작업에 추가 구현을 요구하지 않는다.
- 스킬 release와 지원하는 라이브러리 버전의 대응 정보를 관리한다. 로컬 `0.1.0`처럼 같은 버전 문자열 아래 변경 중인 작업은 소스 revision 또는 관련 산출물 hash도 확인해야 한다. 전체 manifest 형식은 후속 설계에서 정한다.
- 저장소의 `skills/viewstem`을 관리 원본으로 두고 배포물 안에서 상대 참조가 완결되게 하는 안이다. Codex용 `agents/openai.yaml` 등은 필요할 때 추가하되 공통 본문에서 특정 호스트의 도구를 필수 전제로 만들지 않는다.
- 정확한 설치 명령과 배포 채널은 실제 대상 호스트와 공개 배포물을 검증한 뒤 안내한다. 이번 작업은 설치·발행을 수행하지 않는다.

## 6. 대안과 반론

어느 대안도 사용자가 수락하거나 기각한 것으로 기록하지 않는다.

| 안 | 이점 | 비용·실패 조건 |
|---|---|---|
| 문서와 검색 가능한 색인만 제공 | 유지보수 지점이 가장 적고 이미 작성 중인 문서를 활용 | 에이전트가 필요한 계약을 찾아 조합하는 반복 비용과 잘못된 API 추론을 줄이지 못할 수 있다. 실제 작업에서 충분하면 스킬 확장 필요성이 약해진다. |
| **단일 `viewstem` + 작업별 참조 자료** — 현재 가설 | 설치·선택이 단순하고 폼 작성처럼 여러 패키지를 오가는 작업을 한 흐름으로 다룸 | 진입 설명이 너무 넓어지거나 참조 자료가 계속 늘면 필요한 정보를 못 찾을 수 있다. 행동 평가로 확인해야 한다. |
| `viewstem`·`viewstem-svelte`·`viewstem-svelte-ui`로 분리 | core 단독 소비자, renderer 통합자, UI 작성자의 독립 진입점을 제공 | 등록·DSL·수명 규칙의 중복, 활성화 중첩, 별도 설치 시 형제 스킬 누락 문제가 생길 수 있다. 독립 사용 빈도와 평가 결과가 이를 상쇄할 때 분리한다. |

리소스 7종 또는 UI 66계열마다 스킬을 만들 필요는 아직 입증되지 않았다. 리소스 간 연결이 실제 작업의 중심이므로 파일 분류를 그대로 작업 경계로 삼지 않는다. 반대로 단일 스킬에서 누락이 반복된다면 스킬 수 최소화를 고집하지 않는다.

## 7. 완료 기준과 평가 제안

문서 조사와 설계의 완료는 스킬 효과 입증과 다르다. 이번에는 아래 평가를 설계했으며 실행하지 않았다.

| 소비자 요청 | 관찰할 성공 조건 |
|---|---|
| 기존 Svelte 앱에 첫 View 추가 | 필요한 계약·구현·CSS가 등록되고 DOM에 출력되며 닫을 때 소유 자원만 정리됨 |
| 입력 폼과 저장 Action 연결 | 입력 payload가 State로 전달되고 저장 후 필요한 조회만 갱신됨; 실패가 성공으로 숨겨지지 않음 |
| core만으로 상태와 Query 사용 | DOM/Svelte 의존 없이 동작하고 실제 설치된 공개 API를 사용함 |
| 반복 목록 정렬과 필터 변경 | 안정 key를 통해 의도한 상태가 유지되고 제거된 수명의 이벤트는 새 항목에 적용되지 않음 |
| Calendar child 또는 custom table cell 요청 | JSON 지원 여부를 먼저 확인하고 native 전용 요구를 호스트 코드로 해결함 |
| 초기 Query 완료 전에 화면이 보이는 이유 진단 | core 초기 완료, DOM 반영, 브라우저 paint를 구분하고 실제 완료 신호를 확인함 |
| 취소·View 교체 후 늦은 응답 문제 수정 | 재현에서 오래된 실행의 쓰기가 차단되고 현재 View가 유지됨 |
| 설치 버전과 다른 문서·미지원 기능이 주어짐 | 불일치를 식별하고 존재하지 않는 API·지원 약속을 생성하지 않음 |
| 일반 Svelte 화면 또는 다른 라이브러리 사용 요청 | Viewstem 스킬이 불필요하게 개입하거나 라이브러리를 도입하지 않음 |

동일한 라이브러리 버전·입력·환경·모델 조건에서 **문서만 제공한 기준선과 스킬을 제공한 경우**를 새 문맥으로 비교한다. 최종 산출물의 타입·실행·브라우저 동작을 우선 보고, 오작동·API 추측·사용자 수정 횟수·불필요한 파일 읽기·도구 호출·토큰을 함께 기록한다. 한 번의 성공으로 일반적인 개선을 주장하지 않는다.

배포 전에는 frontmatter·상대 링크·보조 도구의 오류 처리와, **저장소가 없는 별도 소비 디렉터리**에서 설치된 패키지로 작업하는 흐름을 확인한다. 소비 앱에 이 저장소 전용 `npm run check:svelte-ui` 등을 실행하라고 요구하지 않는다. 지원을 선언할 에이전트 호스트마다 발견·참조 해석·도구 실행을 확인한다.

## 8. EGM 검토 결과와 구체화

[egm-brainstorm](/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/skills/egm-brainstorm/SKILL.md)의 readiness 확인 후, [Codex 통합 지침](/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/docs/codex.md)에 따라 6개 Goldfish를 `fork_turns:none`으로 실행했다. design·codebase-details·zoom-out·comprehension·implementation-readiness·structural 모두 실제 최종 응답을 받았으며 실패·재시도·미실행은 없었다. 동시 실행은 호스트 슬롯 제한에 따라 2개씩 진행했고 후기 검토자에게 앞선 결과를 전달하지 않았다.

중복을 합친 결과는 Blocker 0 / Major 2 / Nit 5다. 주요 지적은 ID 하나의 UI 계약도 큰 출력을 만들 수 있다는 점과, 모든 구성을 묶은 평가로는 각 구성의 필요성을 판단하기 어렵다는 점이다. [통합 보고서](docs/designs/viewstem-skills-review-2026-11-05/goldfish_review_report.md)에 원문·읽기 기록·판정 범위를 연결했다.

반영한 권고 구성은 `viewstem` 진입 스킬 하나와 작업별 자료이며, 도구 후보는 범용 `inspect.mjs` 대신 UI input/event를 선택하는 `inspect-ui.mjs`로 좁혔다. 원본 codec·uncertain와 조회 출처·범위를 보존하고, 진단 채널·부품 발견·암묵 활성화·버전/설치 경계를 구체화했다. 문서→얇은 지침→필요 자료→UI 조회의 순서로 각 요소의 효과를 확인한다. 상세 파일·도구·검증 계약과 발견별 처리 표는 [설계 문서](design_draft.md)를 따른다.

독립 검토 대상은 초기 가설이며, 상세 설계의 행동 평가나 실제 구현 검증은 아니다. 파일시스템과 호스트 지침까지 격리됐다는 보장도 하지 않는다. 스킬 구현·설치·발행과 제품 명세·결정 등록부 변경은 수행하지 않았다.
