# Stage 7 — Design Critique

Reviewer `/root/final_stage7_design`, actual FINAL_ANSWER received.

검토 결과: **Blocker 0 / Major 0 / Nit 2**. 구현 착수를 막는 구조적 결함은 확인하지 못했다. 단일 스킬과 선택 조회 도구의 경계, 공개 계약 보존, 단계별 행동 비교는 타당하다. 아래 두 항목은 호스트 검증과 평가 결과의 오판을 막기 위한 구체화다.

## S7-D01 — Nit — 호스트 검증에 설치 경로 차이를 명시해야 한다

- 대상: snapshot 44–46, 182–190, 202행.
- 근거: 공식 `claude-code-skills.md` 158–164, 221–228행에 따르면 로컬 개인 스킬, 저장소 스킬, 계정에 업로드한 스킬의 발견 범위가 다르다. 특히 클라우드 프로젝트 채팅은 저장소의 `.claude/skills/`를 읽지 않는다. 현재 설계는 호스트별 검증을 요구하지만, 로컬·클라우드 지원에 필요한 서로 다른 설치 경로를 검증 단위로 명시하지 않는다.
- 영향: 두 호스트의 로컬 검사만 통과하고 파일·Node 접근이 가능한 클라우드 환경까지 지원 완료로 확대할 여지가 있다.
- 최소 수정: integration 자료에 **사용 환경 → 설치·발견 경로 → 공통 revision 식별 방법**의 짧은 표를 요구하고, 서로 다른 설치 경로는 별도 발견·참조·실행 증거를 남기도록 한다. 실제 증거는 구현 후 확보하면 되며, 지금 모든 환경을 실행하라는 요구는 아니다.

## S7-D02 — Nit — A/B 실행 시 활성 스킬과 실제 revision의 확인이 빠져 있다

- 대상: snapshot 202, 208–213행.
- 근거: 새 대화와 초기 앱 snapshot은 개인·계정·플러그인 스킬 설정을 초기화하지 않는다. 공식 `claude-code-skills.md` 951–962행은 기준선 실행에서 스킬을 실제로 끄도록 구분하고, OSS `expo-eval.md` 34행은 설치된 다른 revision이 호출되어 엉뚱한 버전을 평가하는 사례를 설명한다. Codex도 같은 이름의 스킬이 여러 위치에서 발견될 수 있다.
- 영향: A에 Viewstem 스킬이 남거나 후보 대신 기존 revision이 활성화되면 비교 결과의 의미가 흐려진다.
- 최소 수정: 평가 준비 조건에 **A에서 대상 스킬 비활성 확인, 후보 실행에서 호출된 스킬 경로·revision 확인, 다른 스킬 설정 고정**을 추가한다. 전용 평가 프로필 또는 일시적 설정 격리로 충분하며 새 평가 시스템은 필요 없다.

공개 릴리스 ref, 정확한 지원 버전 조합, 실제 호스트 실행 결과가 아직 없는 점은 발견으로 세지 않았다. 문서가 이를 구현·배포 완료 조건으로 정확히 남겨 두고 있다. UI의 DOM/native payload 구분과 Query 완료·DOM 반영·paint 구분은 확인한 공개 자료와 일치했다.

## 실제 읽기

- 가장 먼저 EGM `agents/design_critic.md` 전문, 이어 `resources/document_standards/feature-spec-standard.md` 전문.
- 대상 1–231행 검토, 232–267행 맥락. SHA-256 `93d6a46b61ed990fb2385b3e6565950d90033bdeeb72015406f2f8a1820b6967`.
- `goldfish_context.md`, `docs/designs/viewstem-skills-inspection-2026-11-05.json`.
- `docs/README.md`, `docs/VIEWSTEM-SPEC.md` 도입부·§8.5, 결정 등록부 D119–121; core 공개 타입의 오류/관찰/완료/View; Svelte README 관찰/수명; UI README 및 package.json.
- UI support.json 최상위와 Button, Input, Select.Root, Calendar.Day, Chart.Tooltip, DataTable 집중 조회. 전체 부품 적합성 감사 아님.
- 공식 snapshot OpenAI build-skills, Agent Skills best-practices/evaluating/specification, Claude skills 관련 절; Expo eval 격리/트리거 절.

파일 변경·컴파일·설치·제품 실행은 수행하지 않았다. 경로 반복만 줄여 완료 응답을 보존했다.
