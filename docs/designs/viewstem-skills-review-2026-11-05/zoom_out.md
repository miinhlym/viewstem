# egm-zoom-out — Contrarian & YAGNI Brainstormer

- Status: **completed**
- Reviewer agent ID: `/root/goldfish_synthesis/zoomout_brainstormer`
- Native completion evidence: 해당 에이전트의 `FINAL_ANSWER` 수신.
- Mode: `BRAINSTORM`; conversation context: `fork_turns: none`
- Target: [원문 snapshot](review_input_snapshot.md), 원래 [루트 초안](../../../concepts_brief.md) 전체 138줄
- Input SHA-256: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`
- Persona: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md`
- Supplied standards: 없음
- 아래는 검토자가 반환한 보고서다. 코드 표기의 저장소 경로는 저장소 루트 기준이다.

## 반환 보고서

검토 완료 — BRAINSTORM / Contrarian & YAGNI. **Blocker 0, Major 1, Nit 1**입니다. 단일 진입 스킬은 합리적인 작업 가설이며, 추가 구성의 필요성은 아직 입증되지 않았습니다.

입력 해시는 검토 전후 모두 일치했습니다.

`ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`

1. **Major — 묶음 비교만으로는 각 구성의 필요성을 판단하기 어렵습니다.**
   - 대상: `concepts_brief.md` 15행, 50–62행, 128행.
   - 사실: 제안한 비교는 문서 기준선과 스킬 제공 조건입니다. 후자에는 진입 지침·작업별 참조·보조 도구가 함께 포함될 수 있습니다. 기존 문서에는 이미 DSL·호스트·수명·UI 조합 가이드가 있습니다(`docs/handoff/docs-package-reference-2026-11-05.md`, 「메뉴와 페이지별 범위」).
   - 실패 시나리오: 짧은 진입 지침만으로 성공률이 개선되더라도 전체 구성의 성과로 해석해 참조 파일 여섯 개와 보조 도구를 계속 유지합니다. 반대로 불필요한 조회가 증가해도 원인을 구별하기 어렵습니다.
   - 완화: 모든 조합을 평가할 필요는 없습니다. **문서 → 얇은 진입 스킬 → 관찰된 실패에 필요한 참조나 도구 추가** 순으로 비교하면 됩니다. 추가 요소마다 해결한 실패와 비용 변화를 기록하고, 효과 없는 요소는 제외할 수 있어야 합니다.
   - 판단 성격: 실제 성능 결함이 아니라, 최소 구성을 선택하기 위한 평가 설계의 위험입니다.

2. **Nit — ID 단위 추출도 상당한 공통 계약을 반복해서 읽게 할 수 있습니다.**
   - 대상: 38행, 81–87행.
   - 사실: `support.json`은 실제로 2,287,077 bytes·392항목입니다. 그러나 `shadcn.Button` 하나도 입력 123개, callback 40개, unsupported 296개를 참조합니다. 참조 세 묶음과 항목을 모두 펼친 compact JSON은 **41,656 bytes**입니다. CEL 목록은 4,132 bytes입니다.
   - 실패 시나리오: 간단한 버튼·입력·대화상자를 작성하면서 부품마다 공통 DOM 이벤트와 미지원 목록을 반복 출력하면, “필요한 계약만 읽기”의 이점이 줄어듭니다. 작은 CEL 목록까지 같은 도구로 감싸는 비용도 별도로 생깁니다.
   - 재사용·완화: UI README 91–97행에 이미 공개 JSON에서 ID와 참조를 조회하는 짧은 예제가 있습니다. 사이트 생성기 644–664행은 일반 입력과 DOM 이벤트를 공통 묶음으로 구분합니다. 이 근거를 활용해 **조회 출력량과 누락률부터 측정**하고, 보조 도구는 반복 실수가 확인된 조회부터 좁게 시작하는 편이 낫습니다. 전체 정보에 접근할 경로는 유지해야 합니다.
   - 판단 성격: 확정된 CLI 구현의 결함이 아닌 출력·범위 위험입니다.

의미 있는 반론도 있습니다. 2.29MB 원본 대신 약 42KB를 받는 것 자체가 큰 감소이며, 참조 누락을 방지하는 결정적 조회기는 충분히 가치가 있습니다. 따라서 도구를 없애자는 결론은 아닙니다. **짧은 스킬과 기존 문서만으로 충분한지 확인하고, 부족한 조회를 도구로 보완한다**는 대안이 현재 가설보다 유지비가 낮은 비교 대상입니다. 생성기·앱 템플릿·별도 MCP를 유보한 79행과 새 validator를 제외한 87행은 이 방향에 부합합니다.

읽기 기록은 다음과 같습니다. 저장소 경로는 `/Users/minholim/dev/minh/viewstem` 기준입니다.

- **전문:** `AGENTS.md`, `concepts_brief.md` 전체 138행, `docs/README.md`, `docs/VIEWSTEM-SPEC.md`, `docs/handoff/docs-package-reference-2026-11-05.md`, `docs/handoff/open-contracts.md`, `packages/core/README.md`, `packages/svelte/README.md`, `packages/svelte-ui/README.md`, `packages/core/src/cel/supported-functions.json`, `apps/docs/scripts/verify-dsl-docs.mjs`.
- **전문:** `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md`, `/Users/minholim/.codex/skills/.system/skill-creator/SKILL.md`, `/Users/minholim/.agents/skills/svelte-code-writer/SKILL.md`.
- **부분:** `apps/docs/scripts/generate-ui-reference.mjs` 1–210행 및 610–695행. `packages/svelte-ui/src/lib/shadcn/support.json`은 전체 파싱 후 구조·개수·선택 항목 메타데이터·참조 크기를 확인했으며 전체 스키마 본문을 읽지는 않았습니다.
- **검색 결과만:** `packages/svelte-ui/scripts/audit-matrix.mjs`, `generate-components.mjs`, `test-package.mjs`; `packages/core/scripts/build.mjs`, `test-package.mjs`의 지원 메타데이터 관련 일치 구문.
- **별도 심사 표준:** 제공되지 않았습니다. 지정 persona의 BRAINSTORM 기준을 적용했습니다.

실제 에이전트 행동 평가·소비자 설치·제품 빌드는 실행하지 않았습니다. 기존 검증 기록을 재실행 증거로 취급하지 않았으며, 파일 변경·worktree 생성·대화 원문·다른 검토 보고서 조회는 하지 않았습니다.
