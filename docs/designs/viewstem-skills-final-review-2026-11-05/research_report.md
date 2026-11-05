# Viewstem 스킬 최종 리뷰: 외부 근거 조사

- 조사일: 2026-11-05
- 범위: Agent Skills 공식 규격·작성·평가 지침, Codex/Claude Code 공식 호스트 문서, Anthropic·Vercel·Supabase·Expo의 대표 공개 스킬과 운영 자료.
- 방법: 공식 웹과 GitHub connector로 확인. 프로젝트의 설치된 스킬도 비교. 스킬을 설치하거나 실행하지 않았다. 사례는 대표 표본이며 생태계 전체 감사가 아니다.
- 원문과 SHA-256: `research/official/sources.json`, `research/oss/sources.json`, `research/popularity/sources.json`. OSS 파일은 커밋에 고정했다. 시간에 따라 변하는 웹 문서는 수집 시점의 snapshot이다.

## 1. 공식 지침에서 확인한 기준

| 기준 | Viewstem 설계에 적용할 판단 | 1차 출처 |
|---|---|---|
| 작업 단위가 응집돼야 하며 너무 잘게 나누면 여러 스킬 로딩이 필요하다 | 첫 View와 폼은 core·renderer·UI를 함께 쓰므로 공통 진입 하나가 합리적이다. 파일 수를 먼저 채우기보다 실제 실패에 대응하는 참조를 추가한다 | [작성 지침](https://agentskills.io/skill-creation/best-practices) |
| 비자명한 정보와 실제 실패에서 얻은 지식, 참조를 읽을 조건이 중요하다 | 일반적인 코딩 절차를 늘리지 말고 명시 등록, payload, 수명, 완료 신호처럼 Viewstem 특유의 오해를 바로잡는다 | [작성 지침](https://agentskills.io/skill-creation/best-practices) |
| `SKILL.md`의 name/description과 선택적 scripts/references가 공통 형식이다 | 공통 frontmatter에는 두 필수 필드를 사용하고 필요하면 표준 compatibility를 추가한다. 호스트 전용 실행 문법은 공통 본문에 요구하지 않는다 | [Agent Skills 규격](https://agentskills.io/specification) |
| 적은 현실적 사례부터 시작하고 스킬 유무를 비교한다 | 초기 3개 사례와 이후 확대 방향은 부합한다. 판정할 결과와 입력 snapshot을 분리하고 실제 산출물·trace를 남긴다 | [평가 지침](https://agentskills.io/skill-creation/evaluating-skills) |
| 길이 상한은 목표가 아니다 | 짧은 본문을 유지하되 특정 줄 수 자체를 품질 통과 기준으로 삼지 않는 현재 방침을 유지한다 | [작성 지침](https://agentskills.io/skill-creation/best-practices) |

공식 지침은 스킬 효용을 자동 보증하지 않는다. 특히 평가 사례와 보고서 양식의 존재를 실제 통과 증거로 읽으면 안 된다.

## 2. 큰 공개 프로젝트와 설치 지표가 있는 스킬

2026-11-05 웹 조회 시 skills.sh에 표시된 값을 아래에 기록했다. 이는 해당 CLI의 익명 설치 집계이며 고유 사용자·활성 사용자·작업 성공률이 아니다. 검색 캐시와 직접 페이지 사이에 차이가 있어 같은 날 숫자도 달랐으며, 순위의 엄밀한 비교에 사용하지 않는다. [지표 설명](https://www.skills.sh/docs)

| 제공자 / 대표 자료 | 조회된 규모 지표 | 확인한 관행 | Viewstem에서 복제하지 않을 부분 |
|---|---|---|---|
| Anthropic `skill-creator` | 저장소 합계 3.7M, 해당 스킬 424.3K 설치 표시 | 현실적인 평가 입력, 스킬 없는 기준 또는 이전 버전과 비교, 객관적 assertion과 사람의 평가를 분리 | 제작 도구의 긴 전체 절차를 소비자용 스킬 본문에 복사하지 않음 |
| Vercel `vercel-react-best-practices` | 저장소 합계 3.2M, 해당 스킬 871.9K | 진입점에 우선순위와 짧은 규칙 지도, 개별 rules에 이유와 잘못된/바른 코드 | React 성능 우선순위나 전체 합본을 Viewstem 기본 필수 읽기로 적용하지 않음 |
| Supabase `supabase-postgres-best-practices` | 저장소 합계 827.8K, 해당 스킬 472.1K | 작업 범위와 우선순위, 필요한 references, 구체적인 SQL 예와 근거; 별도 릴리스 관리 | 모든 DB 작업을 잡는 넓은 description을 Viewstem에 복사하지 않음 |
| Expo 대표 스킬 묶음과 `expo-skill-eval` | 저장소 합계 1.1M; 평가 스킬 23.8K | 제품 작업별 스킬, 자동 선택과 선택 후 결과를 분리; fixture와 실행 결과로 평가 | 현재 Expo 트리거 평가가 양성 요청의 recall만 다루므로 Viewstem의 음성 사례를 제거하지 않음. Expo의 기기/SDK/플러그인 전용 harness도 필수화하지 않음 |

규모 출처: [Anthropic](https://www.skills.sh/anthropics/skills), [Vercel](https://www.skills.sh/vercel-labs/agent-skills), [Supabase](https://www.skills.sh/supabase/agent-skills), [Expo](https://www.skills.sh/expo/skills).

구조·평가 출처(읽은 revision 고정):

- [Anthropic skill-creator](https://github.com/anthropics/skills/blob/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator/SKILL.md)
- [Vercel React SKILL](https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices/SKILL.md), [관리 README](https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices/README.md)
- [Supabase Postgres SKILL](https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/SKILL.md), [기여·배포 절차](https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/CONTRIBUTING.md)
- [Expo 평가 스킬](https://github.com/expo/skills/blob/a9e5bd3fa00b4e61f632e43f85da73aee1942582/.claude/skills/expo-skill-eval/SKILL.md), [스킬 관리 README](https://github.com/expo/skills/blob/a9e5bd3fa00b4e61f632e43f85da73aee1942582/plugins/expo/skills/README.md)

위 사례는 하나의 디렉터리 정답을 보여주지 않는다. Vercel·Supabase는 규칙 참조, Expo는 여러 제품 작업 스킬로 구성한다. Viewstem은 아직 평가 전이고 첫 작업이 여러 패키지를 연결하므로 한 스킬로 시작하고 실패가 확인될 때만 분리하는 편이 근거에 맞는다. 이는 조사자의 설계 추론이다.

## 3. 공통 포맷과 호스트 차이

| 항목 | 공통으로 유지할 것 | 호스트별로 검증할 차이 |
|---|---|---|
| 본문과 참조 | 동일한 `SKILL.md`, 상대 참조, Node helper | 실제 설치된 SKILL 파일을 기준으로 경로를 찾는 방법 |
| 발견 | name/description에 소비자 작업과 제외 범위 명시 | Codex의 selector/명시 호출과 Claude Code의 `/viewstem`, 각 호스트의 자동 선택 trace |
| 설치 위치 | 라이브러리와 별도 설치, 동일 immutable revision | Codex 공식 문서는 `.agents/skills`를 안내; Claude Code는 `.claude/skills` 및 `~/.claude/skills`를 안내. 설치 도구의 실제 목적지와 호스트 버전을 함께 기록 |
| 확장 메타데이터 | 공통 내용을 호스트별로 복제하지 않음 | `agents/openai.yaml`은 Codex용. Claude 전용 substitution·hooks·fork 설정을 공통 실행 조건으로 삼지 않음 |
| 권한 | 사용자 작업 범위 안에서 필요한 작업만 수행 | 특정 호스트의 도구 이름/권한 flag를 공통 SKILL에 고정하지 않음 |

근거: [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code Skills](https://code.claude.com/docs/en/skills). OpenAI 문서는 기존 개발자 문서 URL에서 해당 공식 페이지로 이동했다. 이 표는 문서 확인 결과이며 두 호스트에서 실제 설치·호출했다는 뜻은 아니다.

설치된 Codex skill-installer의 목적지와 최신 문서의 스캔 경로가 완전히 같다고 가정하지 않는다. 구현 때 사용할 호스트/설치 도구 버전을 고정하고 실제 발견을 확인해야 한다. Claude 전용 `${CLAUDE_SKILL_DIR}` 같은 편의 기능이 있다고 해서 공통 본문에 이를 요구할 필요는 없다.

## 4. 설치된 관련 스킬과 대조

- [skill-creator](/Users/minholim/.codex/skills/.system/skill-creator/SKILL.md): 비자명한 지침, 범위 보존, 선택적 참조, 필요한 경우에만 결정적 스크립트라는 기준에 사용.
- [skill-installer](/Users/minholim/.codex/skills/.system/skill-installer/SKILL.md): 별도 repo/path/ref 설치 흐름의 현재 구현 근거. 실제 설치는 수행하지 않음.
- [PixiJS](/Users/minholim/.agents/skills/pixijs/SKILL.md), [shadcn-svelte](/Users/minholim/.agents/skills/shadcn-svelte/SKILL.md), [svelte-code-writer](/Users/minholim/.agents/skills/svelte-code-writer/SKILL.md): 초기 설계 때 읽은 전문 작업 진입·참조 사례. 개인 설치 상태나 파일 존재는 공개 사용량 또는 품질 증거가 아님.
- EGM 자체는 검토 절차로 적용했고, 다른 공개 SKILL 원문 안의 실행 지시는 조사 데이터로만 취급했다.

## 5. 이 조사에서 검증하지 않은 것

Viewstem 스킬은 아직 존재하지 않으므로 자동 발견률, 성공률, 토큰/시간 절감, 외부 소비 설치, helper 출력은 실행 검증하지 않았다. 다른 프로젝트의 공개 평가 문서만으로 그 프로젝트의 실제 평가 통과를 주장하지 않는다. 고유 사용자 수와 모든 스킬의 실행 trace는 조사 범위 밖이다. 구현 착수 판정은 별도 EGM 통합 보고서가 이 근거와 구체적인 설계 결함을 함께 평가한다.
