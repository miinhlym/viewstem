# egm-codebase-details — Local Debuggability & Evidence Brainstormer

- Status: **completed**
- Reviewer agent ID: `/root/goldfish_synthesis/details_brainstormer`
- Native completion evidence: 해당 에이전트의 `FINAL_ANSWER` 수신. 진행 메시지를 완료로 집계하지 않았다.
- Mode: `BRAINSTORM`; conversation context: `fork_turns: none`
- Target: [원문 snapshot](review_input_snapshot.md), 원래 [루트 초안](../../../concepts_brief.md) 전체 138줄
- Input SHA-256: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`
- Persona: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/codebase_details.md`
- Supplied standards: 없음
- 아래는 검토자가 반환한 보고서다. 저장소 링크만 이 폴더 기준 상대 경로로 정규화했다.

## 반환 보고서

상태: **검토 완료. Blocker 0건, Major 0건, Nit 2건.** 이 관점에서는 작업 가설을 막는 결함을 찾지 못했다. 진단·버전·실패 검증의 방향은 이미 있으며, 아래는 세부 설계에서 명확히 할 보강점이다.

입력 SHA-256은 최초·최종 확인 모두 `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`로 일치했다. 별도 formal review standard는 제공되지 않았다.

1. **Nit — 증상별로 확인할 진단 채널을 평가에 연결**

   대상: [concepts_brief.md](../../../concepts_brief.md) 77, 123–128행. 차원: 로컬 관찰성과 실패 진단.

   **확인된 사실:** 초안은 증상에 맞는 snapshot·진단·최소 재현을 요구한다. 실제 공개 표면은 나뉘어 있다. 초기 Query 실패는 완료 Promise의 rejection 대신 `InitialReport.queryErrors`에 들어가고([공개 타입](../../../packages/core/src/index.d.ts) 152행), Store에는 `getDiagnostics()`가 있으며, Svelte 렌더·이벤트 오류는 `onError`로 관찰한다([Svelte README](../../../packages/svelte/README.md) 86행). 렌더 실패 뒤에도 성공한 core State 쓰기는 유지된다.

   **실패 시나리오·추론:** 에이전트가 `initialComplete` resolve나 State 변경만 확인하면 Query 실패 또는 renderer 오류를 놓치고 수정 성공으로 보고할 수 있다.

   **보강:** troubleshooting의 최소 요구에 “증상→확인할 공개 채널→기대/실제 결과” 연결을 명시하고, 평가에 **core 적용은 성공했지만 렌더가 실패한 경우**, **초기 완료는 resolve됐지만 queryErrors가 있는 경우**를 추가한다. 오류의 `code/location/input/cause`, 대상 `instanceId/generation`, 재현 순서를 보존하면 된다. 새 tracing 시스템은 필요 없다. 구체 API 표와 출력 형식은 후속 설계로 남겨도 된다.

2. **Nit — 계약 조회 결과에도 출처와 완결성 근거를 동반**

   대상: [concepts_brief.md](../../../concepts_brief.md) 83, 94–96행. 차원: 계약 조회의 추적 가능성.

   **확인된 사실:** 초안은 설치 패키지를 기준으로 계약을 조회하지만 조회한 계약과 출처를 한 결과에 남길지는 명시하지 않는다.

   **실패 시나리오·추론:** 같은 `0.1.0`에서 내용이 다른 산출물을 사용하거나 도구 실패 후 수동 조회로 전환하면, 이후 검토자가 어떤 파일의 어느 항목을 근거로 JSON 지원 여부를 판단했는지 재현하기 어려울 수 있다.

   **보강:** 도구·수동 조회 모두 선택 ID와 함께 패키지 버전, 실제 읽은 공개 파일 위치와 revision/hash, 해소한 참조 및 누락 여부를 남긴다는 요구만 추가한다. 전체 manifest나 로깅 기반시설을 지금 결정할 필요는 없다.

의미 있는 반론은 **이 요구들이 이미 77·96행에 포괄돼 있어 개념 문서에 더 넣으면 구현 세부가 늘어난다**는 것이다. 타당하므로 둘 다 Nit로 판단했다. 작은 증거 예시와 평가 실패 사례만 추가하는 정도면 충분하다. 문서 색인과 짧은 진단 안내만으로 같은 결과를 얻는다면 `inspect.mjs`를 보류하는 대안도 유지해야 한다.

완전 읽기 영수증:

- 설치 페르소나 `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/codebase_details.md` — 전체
- [AGENTS.md](../../../AGENTS.md) — 전체
- [concepts_brief.md](../../../concepts_brief.md) — 전체 138행
- [docs/README.md](../../README.md) — 전체
- [VIEWSTEM-SPEC.md](../../VIEWSTEM-SPEC.md) — 전체 468행
- [Core README](../../../packages/core/README.md) — 전체
- [Core 공개 타입](../../../packages/core/src/index.d.ts) — 전체
- [Svelte README](../../../packages/svelte/README.md) — 전체
- [호스트 연결 명세](../../spec/07-host-integration.md) — 전체
- [패키지 문서 인계](../../handoff/docs-package-reference-2026-11-05.md) — 전체
- [후속 범위](../../handoff/open-contracts.md) — 전체

부분 읽기로만 남은 파일은 없다. 대화·기억·원문 아카이브·다른 검토 보고서는 읽지 않았다. 파일 변경·빌드·런타임 검증은 수행하지 않았으며, 지원 JSON 원본·추출 알고리즘·배포물·호스트 호환성과 스킬 효과는 이번 검토로 입증하지 않았다.
