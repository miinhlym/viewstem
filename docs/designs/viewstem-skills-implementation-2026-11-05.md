# 소비자 스킬 실행 계획 — 2026-11-05

2026-11-06 범위 변경: 이 문서의 두 호스트 첫 지원·Claude 준비 계획은 당시 실행 계약이다. D129에 따라 현재 지원·검증 대상과 배포 필수 조건은 Codex로 한정한다. [현재 범위](../handoff/viewstem-skills-scope-2026-11-06.md)를 따른다.

상태: 최종 리뷰의 F1–F7을 반영한 실행 계약. 사용자가 최소 스킬과 초기 비교 실험의 구현을 요청했다. **Claude Code는 준비만 수행**하며 실제 실행·로그인·설치 검증 통과로 보고하지 않는다. Codex와 Claude Code의 공통 지원 목표는 유지한다. 공개 발행은 범위 밖이다.

실행 완료: 최소 4파일과 검사기를 구현했고 Codex A/B/B2 9회의 기능 검증을 완료했다. Claude Code는 A/최종 B2의 6개 입력을 준비했다. [초기 결과와 남은 범위](../handoff/viewstem-skills-initial-2026-11-05.md)를 따른다. 아래 C/D는 도입 조건을 충족하지 않아 생략했다.

이후 사용자가 요청한 Codex 확장 비교와 B3 보완은 [별도 실행 계약](viewstem-skills-extended-2026-11-05.md)과 [확장 결과](../handoff/viewstem-skills-extended-2026-11-05.md)에 기록한다. 이 문서의 초기 실험 결과와 식별자는 당시 증거로 유지한다.

## 1. 변경 범위와 실행 순서

| 단계 | 정확한 Create/Modify 파일 | 완료 조건 |
|---|---|---|
| 0. 리뷰 보완 | Modify `design_draft.md`, `docs/VIEWSTEM-SPEC.md`, `docs/history/decision-register.md`; Create 이 계획 | F1–F7 계약, 조건부 helper, 호스트 경로, 소비 검증, 초기 평가 범위 명시 |
| 1. 최소 후보 B | Create `skills/viewstem/SKILL.md`, `skills/viewstem/agents/openai.yaml`, `skills/viewstem/integrations/codex.md`, `skills/viewstem/integrations/claude-code.md` | 공통 본문·상대 참조·공개 계약·호스트별 차이를 분리. 작업용 references는 아직 만들지 않음 |
| 2. 초기 비교 | Create `skills/tests/scenarios.json`, `skills/tests/consumer.mjs`, `skills/tests/run-initial.mjs`, `skills/tests/behavior-results.json`; Create `docs/handoff/viewstem-skills-initial-2026-11-05.md` | 고정 tarball과 외부 앱 snapshot으로 Codex의 3과제 × A/B 각 1회 비교. 관찰 후 본문 보완 B2를 같은 3과제에 각 1회 재평가. Claude는 A/최종 B2 입력·호출 초안을 준비하고 not_run 기록 |
| 4. 조건부 helper D | **C에서도 UI 선택 조회의 반복 오류/과도한 출력이 남을 때만** Create `skills/viewstem/scripts/inspect-ui.mjs`, `skills/tests/inspect-ui.test.mjs` | 아래 출력 계약과 원문 보존 검사, C 대비 해당 과제 재평가. 조건 미충족이면 근거와 생략을 기록 |

초기 비교의 목적은 구성 선택이다. helper가 없어도 최소 스킬 완료가 가능하다. 전체 10개 시나리오 반복·클라우드 설치 실증·npm/스킬 공개 릴리스는 이번 초기 실행과 구분한다. 제품 API·루트 의존성·CI·문서 사이트는 변경 범위가 아니다. 테스트 도구는 배포 폴더 밖에 둔다.

## 2. 호스트 설치·발견 계약 (F2)

- 기본 배포물은 같은 `skills/viewstem/` 폴더다. Codex의 저장소 발견 경로는 `<app>/.agents/skills/viewstem/`, Claude Code의 저장소 발견 경로는 `<app>/.claude/skills/viewstem/`로 정한다. 이 파일 경로들은 로컬/원격 터미널 모두 적용할 수 있지만 실제 호스트가 발견하는지 확인해야 한다.
- 저장소 폴더를 발견하지 않는 계정/클라우드 세션은 같은 폴더의 아카이브를 해당 호스트의 명시적 업로드·설치 흐름으로 전달한다. 호스트가 이를 제공하지 않으면 미검증/사용 불가로 기록한다. 별도 스킬 본문이나 원격 조회기는 만들지 않는다.
- 각 경로에서 호스트/버전/세션 유형, 설치 목적지 또는 native 설치 ID, 파일별 SHA-256, 명시 호출, 암묵 선택, 상대 참조 읽기, Node 실행을 구분해 기록한다. 경로 한 개의 통과를 다른 경로의 증거로 쓰지 않는다.
- 설치 대상이 이미 있으면 자동 병합/덮어쓰지 않는다. 명시 교체 시 이전 완전한 폴더/아카이브와 식별자를 발견 디렉터리 밖에 보존하고 새 revision으로 교체한다. 되돌리기는 그 완전한 이전 산출물을 복원한 뒤 새 세션에서 실제 로딩 식별자를 확인한다. 라이브러리 버전은 변경하지 않는다.
- 실제 안내는 두 integration 파일이 소유한다. 아직 공개 ref가 없으므로 실행 가능한 공개 설치 명령으로 홍보하지 않는다. Claude Code의 실제 호스트 검증은 사용자 요청에 따라 이번에는 미실행이다.

## 3. 소비 검증 실행 계약 (F4)


```text
node skills/tests/consumer.mjs prepare --project <새 외부 빈 디렉터리> --tarballs <고정 tarball 디렉터리>
node skills/tests/consumer.mjs check --project <외부 소비 앱> --scenario first-view
node skills/tests/consumer.mjs check --project <외부 소비 앱> --scenario form
node skills/tests/consumer.mjs check --project <외부 소비 앱> --scenario native
```

외부 fixture는 자체 package.json, tsconfig, `src/app.ts`, index.html, bootstrap.ts를 가진다. 작업자는 `mountApp(target, services)`를 구현하고 dispose를 반환한다. 검사기는 저장소 예제나 기존 test/fixtures를 정답으로 복사하지 않는다. 배포 스킬에 예제가 추가되면 그 코드도 같은 소비 경계에서 검사한다.

- UI/호스트: strict, Bundler 해석, skipLibCheck(현재 upstream 선언 제한), ES2022와 DOM. Svelte 파일은 **소비 앱에 설치된** Svelte compiler로 컴파일한다. svelte/browser 조건으로 번들하고 localhost HTTP origin에서 Chromium으로 DOM·이벤트·정리를 확인한다. 타입 실패·빌드 실패·페이지 오류·개별 assertion을 따로 기록한다.
- 관리 도구: 저장소에 이미 있는 esbuild/playwright/typescript/svelte-check 실행기를 사용할 수 있다. 이는 평가 runner의 의존성이며 배포 스킬이나 소비 앱의 필수 명령으로 요구하지 않는다. 에이전트에게는 npm run check/build라는 검증 명령만 제공한다.
- 이번 관리 runner의 npm 명령 생성은 POSIX shell을 대상으로 하며 macOS에서 확인했다. 공통 스킬 자체의 실행 환경 계약과 구분한다. Windows shell·다른 패키지 매니저의 실행을 검증했다고 주장하지 않는다.
- core 단독(후속 전체 평가): 별도 core-only fixture, strict NodeNext/ES2022 공개 타입과 Node 실행을 사용한다. UI용 설정이나 Svelte 의존성을 core 지원의 전제로 넣지 않는다. 초기 3개 UI 과제의 통과를 core-only 검증으로 계산하지 않는다.
- 브라우저/서버는 성공·실패 모두 종료한다. 평가 산출물은 디버깅을 위해 보존한다. 다른 작업의 임시 디렉터리를 정리하지 않는다.
- 격리: 작업 CWD는 저장소 밖이고 후보 에이전트는 소비 앱의 src, 설치된 공개 패키지, 해당 arm의 스킬만 읽는다. 원 저장소 src/docs/test/fixtures와 관리 harness의 내부를 읽도록 안내하지 않는다. CWD/sandbox가 모든 파일 읽기를 차단하는 것은 아니므로 실제 trace의 읽기 범위도 검사한다.

## 4. 초기 평가 계약 (F5, F6)

- A = 공개 패키지 README·타입·지원 JSON과 일반 도구. Viewstem 스킬 없음.
- B = A + 짧은 공통 진입 본문과 설치 안내. 설치 안내는 설치/발견 문제에만 읽는다.
- B2 = 초기 B에서 관찰한 사전 전체 출력에 대응해 README 우선·필요한 named member만 조회하도록 본문을 수정한 후보. 참조 파일이나 helper는 추가하지 않았다. 기존 validator 호환을 위해 Node 요구사항을 frontmatter에서 본문으로 옮겼다. 최초 A/B 비교 후 추가한 재평가이며 사전 계획한 독립 조건인 것처럼 다루지 않는다.
- C = B + 관찰 실패를 해결하는 참조. D = 필요성이 확인된 helper.
- 최종 비교 대상은 항상 **기준선 A와 최종 후보**로 부른다. B를 최종 후보의 별명으로 사용하지 않는다.
- 최초 3개 과제는 `scenarios.json`의 동일 prompt와 초기 앱을 사용한다. 정답 구현·다른 arm의 실패·판정자의 세부 기대값을 실행 에이전트에게 전달하지 않는다. bootstrap의 공개 서비스 계약과 npm 검증 명령은 양쪽에 동일하게 제공한다.
- Codex는 설치된 CLI 0.160.0, gpt-6.1-terra/high를 양쪽에 고정한다. 각 실행은 새 ephemeral 세션, 최대 360초/명령 호출 50회. 초과·인증·도구 환경 실패를 작업 성공과 구분한다. 모델/설정은 실제 실행 기록에 다시 남긴다.
- A에서 프로젝트/개인/플러그인 경로에 대상 스킬이 없는지 확인한다. B/C에서 실제 읽힌 SKILL 경로와 hash를 기록한다. 다른 설치 스킬과 설정은 동일하게 유지한다. 새 대화만으로 격리가 성립한다고 주장하지 않는다.
- 각 과제 1회로 방향만 관찰한다. 실제 생성 코드의 공개 API, native 경계, State/Action 의미와 검사 결과를 판정한다. success, intervention, wrong API, tool/read 수, wall time, 실제 보고된 token 사용량을 기록한다. bytes를 tokens로 변환하지 않는다.
- 결과의 `commands`는 command execution 호출 수이며 전체 tool 호출 수나 순수 파일 읽기 횟수와 다르다. 모델 wall time과 외부 판정 시간도 분리한다. 실행 순서를 무작위화하지 않았고 일부 실행은 병렬이어서 시간·캐시 차이를 인과적 개선으로 해석하지 않는다.
- 초기 실험은 암묵 선택도 관찰한다. 스킬을 강제로 읽힌 별도 진단이 필요하면 원래 B 결과와 합치지 않는다. 일반 Svelte 음성 요청의 전수 평가는 후속 범위다.
- Claude Code는 같은 시나리오/fixture/기록 구조와 project skill 경로를 준비한다. 사용자의 현재 지시에 따라 로그인·모델 실행을 하지 않고 not_run(reason=user_requested_preparation_only)로 남긴다.

## 5. 조건부 inspect-ui 출력 계약 (F3, F7)

이 절은 구현할 때의 고정 계약이며 현재 실행 가능한 도구가 아니다. stdout은 `JSON.stringify(envelope) + '\n'` 한 번, UTF-8 바이트 기준 **전체 성공 envelope와 끝 개행을 합해 16,384 bytes 이하**로 한다. 오류 envelope는 같은 한도를 넘는 긴 원문 메시지·스키마를 넣지 않는다.

성공 응답에는 `outputVersion`, `ok`, `source`, `result`를 둔다. `source`는 `@viewstem/ui`의 버전, 공개 지원 파일 경로, SHA-256을 포함한다.

| 명령 | result |
|---|---|
| list | ID와 계열 목록, 전체 개수, 페이지 정보 |
| describe | ID, 계열, 슬롯, 필수 입력, 입력·이벤트 이름 |
| input | 지정한 `ports` 항목과 필수 여부 |
| event | 지정한 `events` 항목의 payload 스키마 |

각 결과는 지원 파일에서 참조한 항목의 JSON Pointer를 제공한다. 목록의 인덱스는 정렬과 필터 적용 전 원본 배열 위치다.

- list 정렬은 ID 오름차순. total은 family 필터 후 개수. 빈 목록 또는 `offset >= total`이면 items/pointers는 빈 배열, nextOffset은 null, 성공이다. 마지막 페이지도 nextOffset=null. 그 외 nextOffset=`offset+items.length`다. 없는 family는 NOT_FOUND다.
- 입력과 이벤트는 지원 파일의 JSON 이름으로 조회하고 원본 스키마를 보존한다.
- 초과 오류는 `{outputVersion:1,ok:false,error:{code:"OUTPUT_TOO_LARGE",message,nextStep,requiredBytes,limitBytes:16384,path,pointers:[]}}`다. requiredBytes는 반환하려던 전체 성공 envelope+개행의 바이트 수다. 다른 오류도 code/message/nextStep을 필수로 하며 원문 제한이 있으면 reason을 별도로 넣는다.
- project/인자 오류 exit 2, 데이터/미설치/미지원/크기 오류 exit 1, 성공 exit 0. 오류 처리 순서는 기존 설계 §4를 따른다. 모든 입력이 유효한 경우에만 선택 항목을 반환한다.
- helper 테스트에는 limit1/20/100, 빈/마지막/범위 밖 페이지, 멀티바이트 경계, 전체 envelope 한도, 없는 입력·이벤트, 앱 위치 변경과 no-write를 포함한다. 이 규칙 때문에 helper의 필요성이 자동 입증되는 것은 아니다.
