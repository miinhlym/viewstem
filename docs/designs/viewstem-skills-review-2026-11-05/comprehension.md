# egm-comprehension — UX & Developer Ergonomics Brainstormer

- Status: **completed**
- Reviewer agent ID: `/root/goldfish_synthesis/comprehension_brainstormer`
- Native completion evidence: 해당 에이전트의 `FINAL_ANSWER` 수신.
- Mode: `BRAINSTORM`; conversation context: `fork_turns: none`
- Target: [원문 snapshot](review_input_snapshot.md), 원래 [루트 초안](../../../concepts_brief.md) 전체 138줄
- Input SHA-256: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`
- Persona: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/comprehension.md`
- Supplied standards: 없음
- 아래는 검토자가 반환한 보고서다. 저장소 링크만 이 폴더 기준 상대 경로로 정규화했다.

## 반환 보고서

상태: **BRAINSTORM 검토 완료 — Blocker 0, Major 1, Nit 2.** 단일 `viewstem` 진입 스킬 가설은 유지할 수 있다. 아래는 UX & Developer Ergonomics 관점의 보완 요구다. 별도 공식 검토 기준은 제공되지 않았다.

입력 SHA-256은 검토 전후 모두 일치했다: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`.

1. **Major — 부품별 조회만으로는 정보량을 충분히 줄이지 못할 수 있다.** 대상: [concepts_brief.md](../../../concepts_brief.md) 83, 38·128행.
   - **사실:** 실제 지원 JSON에서 세 참조를 확장한 직렬화 모형은 `shadcn.Button` 45,208 bytes·입력 속성 123개, `shadcn.Input` 46,543 bytes·137개였다. `shadcn.DataTable`은 1,655 bytes였다.
   - **실패 시나리오·추론:** 작은 입력 폼을 작성하면서 여러 부품을 조회하면 일반 HTML·ARIA 계약이 반복되어 필요한 `value`·이벤트 계약이 묻힌다. 전체 2MB를 피하더라도 “필요한 계약만 읽는다”는 목표가 약해질 수 있다.
   - **사용성 요구:** 기본 요약, 작업에 필요한 속성·이벤트 상세, 전체 계약 접근을 구분하고 공통 계약의 반복 반환을 줄인다. 생략 범위와 전체 조회 경로는 명시한다. 실제 폼 작업의 누적 출력량과 계약 누락을 함께 평가한다. 정확한 CLI 옵션은 후속 설계 사항이다.

2. **Nit — 부품을 발견하는 단계와 ID별 계약 조회 사이 연결이 약하다.** 대상: [concepts_brief.md](../../../concepts_brief.md) 76, 83–85·122행.
   - **사실:** 후보 도구는 “선택한 UI 부품”을 조회하고 알 수 없는 ID를 구분한다. 대응 계열·부품을 처음 선택하는 경로는 명시하지 않는다. 읽은 패키지 README는 66계열과 ID 예시를 설명하고, 문서 인계에는 전체 계열 색인이 있다.
   - **실패 시나리오·추론:** “검색 가능한 다중 선택을 추가”라는 요청에서 에이전트가 존재할 법한 ID를 먼저 추측하고 실패 후 큰 지원 JSON을 반복 탐색할 수 있다.
   - **사용성 요구:** 요구 → 계열 후보 → JSON/native 지원 → 상세 계약의 탐색 순서를 참조 자료에 연결한다. 기존 계열 색인이나 설치 메타데이터의 간단한 목록으로 충분하며 별도 검색 시스템은 필요하지 않다. 알 수 없는 ID 오류에는 다음 탐색 경로를 제공한다.

3. **Nit — 명시적인 Viewstem 이름이 없는 기존 앱 작업의 발견성 평가가 빠져 있다.** 대상: [concepts_brief.md](../../../concepts_brief.md) 66, 116–126행.
   - **사실:** 넓은 일반 키워드 활성화를 피하고 일반 Svelte 요청에서 개입하지 않는 평가가 있다. 반면 기존 Viewstem 앱에서 일반 표현으로 요청하는 긍정 사례는 없다.
   - **실패 시나리오·추론:** 사용자가 기존 Viewstem 화면에 “필터 추가해줘”라고 요청하면 필요한 스킬을 놓칠 수 있다. 현재 문구만으로 실제 누락을 확정할 수는 없다.
   - **사용성 요구:** 같은 일반 요청을 Viewstem 사용 프로젝트와 일반 Svelte 프로젝트에 각각 주어 적절한 활성화·비활성화를 함께 측정한다. 사용자에게 매번 라이브러리 이름을 반복하게 하지 않는 것이 기준이다.

반론도 유효하다. 전체 계약 반환은 속성이나 접근성 기능을 누락하는 추론을 막고 도구 구현을 단순하게 만든다. 따라서 무조건 짧게 자르기보다 **명시적인 요약과 손실 없는 상세 접근**을 비교해야 한다. 기존 문서 색인만으로 탐색이 충분하다면 보조 도구에 발견 기능까지 추가할 이유도 약하다. 이 문제들은 스킬을 여러 개로 나눈다고 자동으로 해결되지 않는다.

읽기 확인:

- **전문:** 페르소나 `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/comprehension.md`
- **전문:** [concepts_brief.md](../../../concepts_brief.md), [AGENTS.md](../../../AGENTS.md)
- **전문:** [docs/README.md](../../README.md), [VIEWSTEM-SPEC.md](../../VIEWSTEM-SPEC.md)
- **전문:** [open-contracts.md](../../handoff/open-contracts.md), [docs-package-reference-2026-11-05.md](../../handoff/docs-package-reference-2026-11-05.md)
- **전문, 비교 자료로만:** `/Users/minholim/.agents/skills/pixijs/SKILL.md`, `/Users/minholim/.agents/skills/svelte-code-writer/SKILL.md`

한계: 실제 스킬·도구 실행, 호스트 활성화, 토큰 사용량 비교는 수행하지 않았다. 크기 수치는 제안 CLI의 실제 출력이 아닌 메타데이터 확장 모형이다. 제품 빌드·파일 수정·워크트리 생성 및 대화 원문·다른 검토자 산출물 열람은 하지 않았다.
