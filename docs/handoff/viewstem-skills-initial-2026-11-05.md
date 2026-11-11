# 소비자 스킬 최소 구현·초기 비교 — 2026-11-05

최종 EGM의 F1–F7을 [설계](../../design_draft.md)와 [실행 계획](../designs/viewstem-skills-implementation-2026-11-05.md)에 반영하고, 공통 스킬 4파일과 외부 소비 앱 검사기를 구현했다. Codex의 3개 과제 × A/B/B2 **9회가 기능 검증을 통과**했다. 최종 후보는 본문을 보완한 B2이며 별도 작업 참조와 UI 조회 helper는 추가하지 않았다.

사용자 지시에 따라 **Claude Code는 준비만 완료**했다. A/최종 B2의 6개 소비 앱·동일 프롬프트·설치 폴더·호출 초안을 만들었다. Claude CLI 설치, 로그인, 모델 호출, 실제 발견 검증은 하지 않았다. 이는 두 호스트 지원 목표를 바꾼 결정이 아니며 전체 지원·공개 배포 완료 판정도 아니다.

## 구현과 리뷰 보완

배포 단위는 [skills/viewstem](../../skills/viewstem/SKILL.md)의 네 파일이다.

| 파일 | 책임 |
|---|---|
| `SKILL.md` | 공개 설치 패키지에서 시작하는 공통 지침, 필요한 UI 계약만 조회, State·이벤트·native·수명 경계 |
| `agents/openai.yaml` | Codex 표시 이름과 설명. 자동 선택은 기본 활성 |
| `integrations/codex.md` | `.agents/skills/viewstem/` 발견, 호스트별 설치·교체·되돌리기 확인 |
| `integrations/claude-code.md` | `.claude/skills/viewstem/` 발견과 별도 호스트 검증. 공통 본문 복제 없음 |

[consumer.mjs](../../skills/tests/consumer.mjs), [run-initial.mjs](../../skills/tests/run-initial.mjs), [scenarios.json](../../skills/tests/scenarios.json)은 배포 폴더 밖의 관리 도구다. 제품 API·루트 의존성·CI·문서 사이트를 이 작업에서 변경하지 않았다. 기존 작업 트리의 다른 변경은 보존했다.

| 최종 리뷰 항목 | 반영과 검증 범위 |
|---|---|
| F1 조건부 helper의 필수 단계화 | 설계·계획에서 조건부로 통일. 실제 관찰 후 생략 |
| F2 설치·발견·교체 경로 | 두 integration에 구체화. Codex 프로젝트 자동 발견만 실제 확인; 나머지 경로는 미검증 |
| F3 helper 결과와 경계값 | 실행 계획 §5에 result·pagination·UTF-8 전체 envelope 한도·오류 계약 고정. 구현·테스트 통과 주장은 없음 |
| F4 독립 소비 검사 구성 | 고정 tarball, 외부 앱, strict/Bundler, 소비 앱 Svelte compiler, HTTP/Chromium 검사 구현. core-only는 후속 |
| F5 기준선 비활성·후보 식별 | 외부 초기 앱과 알려진 개인 설치 경로 확인, 실제 SKILL 읽기·경로·파일 hash 기록. 다른 개인 스킬은 동일하게 사용 가능 |
| F6 B와 최종 후보 구분 | A=기준선, B=초기 본문, B2=수정 본문. 실제 비교 명칭과 결과를 구분 |
| F7 이벤트/원본 prop 이름 | 공통 본문에 JSON event 키와 unsupported native prop의 차이 명시. 별칭 변환 없음 |

[최종 리뷰 snapshot과 보고서](../designs/viewstem-skills-final-review-2026-11-05/consolidated_review_report.md)는 그 시점의 증거로 보존했다. 이번 보완이 새 EGM 전체 검토를 다시 통과했다는 의미는 아니다.

## 입력과 평가 방법

실제 환경은 macOS, Node `v22.21.1`, npm `11.14.1`, `codex-cli 0.160.0`, `gpt-6.1-terra/high`다. 각 모델 실행은 새 ephemeral 세션, 최대 360초·명령 호출 50회, workspace-write, approval never였다. 같은 시나리오의 A/B/B2에는 같은 prompt·초기 앱·공개 패키지를 제공했다. 기대 구현과 다른 실행 결과를 모델에 전달하지 않았다.

검사기는 저장소의 esbuild·Playwright·svelte-check를 사용하지만 Svelte compiler는 **소비 앱의 설치본**에서 해석한다. UI 타입 검사는 strict/Bundler/ES2022/DOM과 현재 선언 제한에 따른 skipLibCheck를 사용했다. 에이전트에는 `npm run check/build`만 제공하고 검사기 내부나 원 저장소를 읽지 않도록 했다. 실제 명령 trace에서 원 저장소 자료를 읽은 명령은 관찰하지 않았다. CWD·sandbox만으로 전체 파일 읽기를 격리했다는 주장은 하지 않는다.

세 과제는 첫 View와 Start 버튼, 입력→State→Action→저장 결과, JSON 계약이 없는 Calendar 부품의 native 조합이다. 타입·빌드·브라우저 표시·서비스 호출·정리를 외부 판정자가 검사했다. 생성 코드의 공개 import, State/Action 의미, native 경계를 별도로 검토했다. `npm run check/build`만 실행한 모델의 자체 보고와 실제 Chromium 판정 결과를 구분했다.

## Codex 결과

아래 시간은 모델 실행 구간의 wall time이며 fixture 준비와 외부 판정 시간은 제외한다. 명령 수는 command execution 호출 수로, 전체 도구 호출 수와 다르다. 세 조건 모두 아래 세 과제를 통과했다.

| 과제 | A: 초 / 명령 | B: 초 / 명령 | 최종 B2: 초 / 명령 |
|---|---:|---:|---:|
| 첫 View | 64.295 / 5 | 54.230 / 7 | 51.401 / 8 |
| 폼 연결 | 175.763 / 12 | 74.061 / 7 | 71.454 / 8 |
| native UI | 100.123 / 11 | 57.234 / 8 | 66.364 / 9 |
| 합계 | 340.181 / 28 | 185.525 / 22 | 189.219 / 25 |

| 측정 | A | B | 최종 B2 |
|---|---:|---:|---:|
| 기능 통과 | 3/3 | 3/3 | 3/3 |
| 실제 Viewstem SKILL 읽기 | 0/3 | 3/3 | 3/3 |
| 명령 출력 bytes | 1,223,850 | 688,892 | 176,955 |
| 보고된 input tokens | 1,745,580 | 1,345,296 | 1,121,552 |
| 위 input 중 cached tokens | 1,637,376 | 1,201,024 | 1,019,264 |
| output tokens | 7,304 | 6,090 | 5,712 |

**A도 모두 통과했으므로 성공률 개선은 입증되지 않았다.** 조건별 과제당 1회이고 실행 순서를 무작위화하지 않았으며 일부 실행은 병렬이었다. 캐시·호스트 부하·과제별 탐색 차이의 영향을 분리할 수 없어 시간·토큰 수의 일반적 개선을 주장하지 않는다. bytes를 토큰으로 환산하지 않았고 cached 수치는 input과 더하지 않는다. 첫 View에서는 후보의 명령 수가 기준선보다 늘었다.

B는 부품 하나의 참조 사전도 통째로 출력해 불필요한 양이 컸다. B2에서 기존 README가 정확한 API를 이미 설명하면 먼저 사용하고, 미지의 입력·이벤트는 필요한 이름만 조회하도록 본문을 보완했다. B2의 첫 View는 추가 지원 JSON 조회 없이, 폼은 필요한 항목만, native 과제는 부품 mode를 확인해 완료했다. 이 범위에서는 추가 참조나 helper를 정당화할 반복 실패가 남지 않았다. B2는 최초 A/B 결과를 보고 추가한 재평가이며 처음부터 독립적으로 정한 조건이 아니다.

기준선 폼은 UI CSS를 빠뜨렸고 B/B2는 포함했다. 이는 수동 검토 관찰로 남기며 사전 정의한 기능 점수를 사후에 바꾸지 않았다. 모든 실행에서 보호 대상 파일·lockfile은 유지됐고 최종 코드에서 잘못된 공개 API나 native JSON 우회를 발견하지 않았다. 모델 실행 중 일부 선택적 도구 탐색 실패는 raw trace에 보존되어 있으며 최종 기능 통과가 모든 중간 명령의 성공을 뜻하지 않는다.

## Claude Code 준비와 호스트 경계

최종 비교용 `claude-code-{first-view,form,native}-{A,B2}` 6개 디렉터리에 초기 앱·prompt·`invocation.json`·`result.json`을 준비했다. B2의 `.claude/skills/viewstem/`는 실제 Codex B2와 동일한 네 파일 hash다. A에는 대상 스킬이 없다. 초기 B용 세 fixture도 이전 후보 기록으로 남겼다.

호출 초안은 prompt를 stdin으로 전달하도록 기록했으며 `execute:false`, `model:null`이다. 실제 실행 전에 CLI 버전/flags 확인, 동일 모델·설정 고정, baseline 활성 경로 확인과 같은 실행 예산 적용이 필요하다. 이번에는 CLI·인증을 준비하도록 사용자에게 요구하거나 임의 설치하지 않았다. 결과는 `not_run(reason=user_requested_preparation_only)`다.

| 확인 항목 | 이번 증거 |
|---|---|
| Codex 프로젝트 스킬 암묵 선택 | B/B2 각각 3/3, 실제 읽은 경로·hash 확인 |
| Codex 명시 호출·integration 상대 참조·교체/되돌리기 | 절차 작성과 정적 링크 확인; 실제 호스트 동작은 미검증 |
| Claude Code 동일 파일·입력 준비 | A/B2 6개 완료; 실제 발견·호출은 미실행 |
| desktop 전용/계정 업로드/클라우드 발견 경로 | 미검증. 로컬 CLI 결과로 대체하지 않음 |

개인 Svelte 스킬들이 모든 조건에서 사용 가능했고 실제로 일부 실행에서 읽혔다. 따라서 다른 스킬이 없는 깨끗한 호스트의 결과로 해석하지 않는다. 이름을 언급하지 않은 기존 앱 수정, 무관한 Svelte 작업의 비활성화, core-only, Query 실패·취소, pnpm/PnP와 전체 10개 시나리오 반복은 이번 초기 검증에 포함하지 않았다.

## 검증·재현 자료

- `consumer.mjs`: 실제 외부 앱의 정상 3과제 통과, TODO·타입 오류·폼 입력 누락 3개 실패 사례를 각각 거부. 결과는 JSON의 `harnessSelfCheck`에 보존.
- Codex 9개 산출물: 타입·빌드·Chromium 동작·정리 통과. TS-only 앱의 Svelte 입력 파일 없음 경고는 오류와 구분해 기록.
- `skill-creator/scripts/quick_validate.py`: 최종 후보 통과. 설치된 구형 validator가 optional `compatibility`를 거부해 Node 요구사항을 본문으로 이동했다. PyYAML은 임시 venv에만 설치했다.
- 두 `.mjs`의 Node 문법, Markdown 상대 링크, 결과 JSON·소스·trace·tarball hash, 최종 B2와 준비된 Claude 파일 동일성 확인. 준비 명령의 POSIX quoting은 공백·따옴표·달러·백틱 경로에서 확인했다.

관리 도구의 기본 사용은 다음과 같다. 먼저 빌드·pack으로 세 tarball을 고정하고 `--workspace`의 `baseline/`을 생성한다. 재실행에는 새 workspace를 사용한다. 기존 run 디렉터리는 덮어쓰지 않는다.

```sh
node skills/tests/consumer.mjs prepare --project /absolute/new-run/baseline --tarballs /absolute/fixed-tarballs
node skills/tests/run-initial.mjs --workspace /absolute/new-run --host codex --arms A,B2
node skills/tests/run-initial.mjs --workspace /absolute/new-run --host claude-code --arms A,B2 --prepare-only
node skills/tests/consumer.mjs check --project /absolute/new-run/runs/codex-form-B2 --scenario form
```

이 runner의 npm script quoting은 POSIX shell 대상이며 이번에는 macOS에서 확인했다. Windows 검증 완료로 확대하지 않는다. 준비 과정에서 snapshot 동시 복사 충돌 2건을 모델 실행 전에 고친 뒤 재시도했다. 에이전트 작업 실패와 별도로 기록했다. 마지막 준비 명령 quoting·호출 metadata·lockfile 보호 보강은 실행 후 변경이며 consumer의 검사 분기와 최종 스킬 내용은 그대로다. 기존 9개 lockfile은 별도로 동일성을 확인했다.

재현용 raw trace·tarball·앱은 로컬 임시 workspace `/private/var/folders/wv/2zqlsrz10lv73mczw_5wsm8w0000gn/T/viewstem-skill-run-p5pywarz`에 보존했다. 임시 디렉터리의 장기 존속을 전제로 하지 않도록 [behavior-results.json](../../skills/tests/behavior-results.json)에 실행 metadata, 실제 생성 코드, 판정 결과, 해시, Claude 준비 내역을 함께 남겼다. 공개 릴리스 ref와 두 호스트의 지원 완료 판정은 후속 검증 대상이다.
