# Stage 5 — Initial Zoom Out

Reviewer: `/root/final_stage5_zoom_out`; actual FINAL_ANSWER received; fresh conversation.

검토 완료: **Blocker 0 / Major 1 / Nit 0**. 외부 소비 앱을 위한 단일 공통 스킬이라는 방향은 타당하다. 최소 스킬과 기준선 작업은 시작할 수 있지만, 조회 도구를 구현할 조건은 실행 계획에서도 일치시켜야 한다.

**S5-01 · Major — 조건부 조회 도구가 구현 표에서는 필수 단계가 된다**

- 대상: snapshot 237–238행. 관련 계약은 206–213행.
- 근거: 211행은 UI 조회에서 반복 오류나 출력 비용이 확인될 때만 `inspect-ui.mjs`를 추가하고 C와 비교하도록 한다. 그러나 237행은 도구와 테스트 생성을 무조건적인 2단계로 지정하고, 행동 평가는 다음 3단계에 배치한다. 참조 자료 생성에는 “필요한”, 후속 수정에는 “필요 시”라는 한정이 있지만 도구 단계에는 조건이나 생략 경로가 없다.
- 결과: 구현자가 §7을 실행 순서로 따르면 필요성 확인 전에 parser·출력 프로토콜·오류 체계와 테스트를 모두 만들게 된다. 이는 문서가 채택한 “관찰 실패를 해결하는 구성만 추가” 원칙을 무력화하며, 파일 크기만으로 도구 개발을 확정하는 결과가 된다.
- 최소 수정: 2단계를 “초기 C 평가에서 UI 조회 실패 또는 반복 비용이 확인된 경우”로 명시하고, 해당 문제가 없으면 도구 없이 3단계로 진행하도록 적는다. 초기 A→B→C 비교가 1단계 안에서 수행된다는 점도 연결한다. §4의 인터페이스 계약은 조건이 성립할 때 사용할 설계로 유지하면 된다.
- 판정 경계: 전체 설계나 최소 스킬의 착수를 막는 Blocker는 아니다. 도구 구현을 착수하기 전 해소할 실행 계획의 모순이다.

## 나머지 판단

- 근본 문제: 11–15행은 외부 앱에서 설치된 계약을 찾고 올바르게 조합·검증하는 문제에 집중한다. 원격 실행기, 별도 MCP, 새 CLI 제품으로 확장하지 않아 프로젝트 경계와 맞는다.
- 단일 스킬 대 분리: 21행과 259행의 단일 진입점은 여러 패키지를 함께 사용하는 작업에 적합하다. 작업별 참조와 명확한 활성화 경계가 있으며, 반복 누락이 입증될 때만 분리를 재평가하므로 조기 분할 문제는 없다. 공식 작성 지침의 작업 단위·선택적 참조 원칙과도 부합한다. Supabase·Vercel 공개 스킬은 유사 구조의 사례지만 Viewstem에서의 효과 증거로 보지는 않았다.
- 기존 코드 재사용: 완성된 소비자용 선택 조회 helper는 찾지 못했다. 기존 문서 생성기는 `propertiesRef`·`callbacksRef`·`unsupportedRef`를 이미 해석하지만 저장소 소스, Svelte compiler, TypeScript 및 문서 쓰기에 결합돼 있다. 그대로 배포 helper로 가져오는 것은 경계에 맞지 않는다. 참조 해석 규칙과 기존 tarball 소비 테스트 방식을 재사용할 수 있으며, 대상 문서 202행도 후자를 이미 요구한다.
- 지원 환경: D119–D121과 대상의 공통 지침·호스트별 연결 분리는 일치한다. Node 22, 일반 `node_modules`, npm/pnpm 및 PnP 보조 도구 한계도 명시돼 있다. Claude 공식 문서는 로컬 개인·프로젝트 스킬과 클라우드 계정 스킬의 로딩 경로가 다름을 보여준다. 구현 시 integration 자료와 지원 검증표에 실제 세션 유형을 기록해야 하지만, 아직 설치 검증이 없다는 사실은 설계 착수 결함이 아니다.
- 평가 비용: 최종 비교는 현재 문구대로라면 최소 **10개 시나리오 × 2개 조건 × 3회 × 2개 호스트 = 120회**이며 초기 비교와 재평가는 별도다. 초기 3개 작업으로 먼저 실패를 찾고 전체 조합을 생략하는 구조는 합리적이다. 실제 실행 계획에서 이 총량과 실행별 예산을 적으면 비용 판단이 쉬워진다. 120회라는 수치만으로 과잉 검증이라고 판정하지 않았다.
- 상세 수준: §4는 외부 도구 인터페이스·원본 정보 보존·실패 경계를 정의한다. 내부 함수나 알고리즘을 고정하지 않아 불필요한 구현 세부로 내려갔다고 보지 않았다.
- 배포 조건: 공개 ref, 정확한 지원 버전 조합, 두 호스트의 실제 발견·호출·동작 증거는 배포 완료 조건이다. 현재 값이나 실행 결과가 없다는 이유로 구현 진입 Blocker를 만들지 않았다.

## 읽기 기록

- Persona 먼저, standard 다음 전문 확인: EGM `agents/zoom_out.md`, `resources/document_standards/zoom-out-standard.md`.
- 대상 1–267행 전체 및 SHA-256 `93d6a46b61ed990fb2385b3e6565950d90033bdeeb72015406f2f8a1820b6967` 확인.
- 지침·기준선: `AGENTS.md`, `goldfish_context.md`, `docs/README.md`, `docs/VIEWSTEM-SPEC.md` 목적/계층/§8.5, `docs/history/decision-register.md` D119–121, `concepts_brief.md` 1–150행, `docs/designs/viewstem-skills-inspection-2026-11-05.json`.
- 코드: `package.json`, `packages/svelte-ui/scripts/generate-components.mjs`, `packages/svelte-ui/scripts/test-package.mjs` 1–200행, `apps/docs/scripts/generate-ui-reference.mjs` 1–90 및 620–690행.
- 공식 snapshot: specification, best-practices, evaluating, OpenAI build-skills, Claude skills의 개요/설치/클라우드/공통 frontmatter 절.
- OSS snapshot: Supabase Postgres, Vercel React; Expo eval은 평가/기준선/비용 검색 부분.
- 검색: `rg --files`, `rg -n 'support\.json|propertiesRef|callbacksRef|unsupportedRef|createRequire|inspect-ui'`로 packages/apps 및 skills 존재 확인. 없는 루트 scripts/skills 대신 실제 디렉터리에서 재검색. 의존성·배포 산출물·vendor 제외.

파일 수정, 설치, 컴파일, 테스트 실행은 하지 않았다. 다른 최종 검토자의 보고서, 채팅 기록, 개인 메모리, `context-archive`는 읽지 않았다. 본 기록은 실제 완료 응답의 발견과 근거를 보존하고 경로 반복만 줄였다.
