# egm-design — Architecture & Token Economics Brainstormer

- Status: **completed**
- Reviewer agent ID: `/root/goldfish_synthesis/design_brainstormer`
- Native completion evidence: 해당 에이전트의 `FINAL_ANSWER` 수신. 진행 메시지를 완료로 집계하지 않았다.
- Mode: `BRAINSTORM`; conversation context: `fork_turns: none`
- Target: [원문 snapshot](review_input_snapshot.md), 원래 [루트 초안](../../../concepts_brief.md) 전체 138줄
- Input SHA-256: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`
- Persona: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/design_critic.md`
- Supplied standards: 없음
- 아래는 검토자가 반환한 보고서다. 코드 표기의 저장소 경로는 저장소 루트 기준이다.

## 반환 보고서

검토 완료. **Blocker 0건, Major 1건**입니다. 단일 진입 스킬이라는 가설을 폐기할 근거는 없지만, 보조 도구의 출력 단위를 보완해야 합니다. 공식 검토 표준은 제공되지 않았습니다.

입력 `concepts_brief.md` 138행을 전체 읽었으며, 검토 시작·종료 시 SHA-256이 모두 `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`로 일치했습니다.

- **Major — 토큰·컨텍스트 비용: ID별 조회만으로는 충분히 좁혀지지 않음**
  - **대상:** `concepts_brief.md:38`, `83–85`, `128`.
  - **확인한 사실:** 현재 `support.json`은 2,287,077바이트다. 각 항목에 `propertiesRef`, `callbacksRef`, `unsupportedRef`의 실제 값을 붙여 압축 JSON으로 직렬화하면 392개 항목의 중앙값은 **39,270.5바이트**, 최댓값은 **57,261바이트**다. Button 하나는 **41,656바이트**이며, 이벤트 40개가 동일한 payload 스키마를 반복한다. Dialog의 Root·Trigger·Content·Title·Description과 Input·Button을 함께 조회하면 **246,163바이트**다. 이는 토큰 수가 아닌 UTF-8 출력 크기 측정이다.
  - **실패 시나리오·추론:** 간단한 저장 대화상자 작성에서도 부품별 계약 전체를 펼치면 일반 HTML 속성, 동일 이벤트 스키마, 수백 개 미지원 리스너 목록이 작업 문맥을 채운다. 도구 출력이 잘리면 정작 필요한 payload나 제한을 놓칠 수 있다. 원본은 한 줄 JSON이므로 85행의 직접 파일 탐색도 일반 텍스트 검색으로 수행하면 전체 파일 출력으로 되돌아간다.
  - **완화:** 개념 수준에서 **부품 발견 → 필요한 입력·이벤트·슬롯 선택 → 정확한 계약 조회**를 지원하도록 명시한다. 동일 스키마는 한 번만 반환하고, 생략한 항목은 이름·추가 조회 경로를 남긴다. `mode`, 필수 입력, 선택한 필드의 제약·codec은 보존한다. 직접 탐색 대안도 JSON 파서로 범위를 제한해야 한다. 평가에는 단일 부품뿐 아니라 위와 같은 여러 부품 조합의 출력 크기·잘림 여부·후속 조회 비용을 포함한다. 정확한 옵션 이름이나 수치 상한은 후속 설계에서 정해도 된다.

가장 강한 반론은 전체 2.3MB를 읽는 것보다 ID별 조회가 이미 크게 작다는 점입니다. 실제로 Dialog.Root는 595바이트, DataTable은 1,506바이트여서 모든 조회에 복잡한 분할을 강제할 필요는 없습니다. 따라서 **기본은 간단한 조회를 유지하되 큰 결과에서 필드 선택과 중복 제거가 가능하게 하는 방식**이 적절합니다. 새로운 서버·MCP·캐시 서비스나 스킬 분리를 도입해야 한다는 근거는 없습니다.

읽기 기록은 다음과 같습니다. 저장소 상대 경로의 기준은 `/Users/minholim/dev/minh/viewstem`입니다.

- **전체:** `concepts_brief.md`, `AGENTS.md`, `docs/README.md`, `docs/VIEWSTEM-SPEC.md`, `packages/svelte-ui/README.md`, `docs/handoff/docs-package-reference-2026-11-05.md`, `docs/handoff/open-contracts.md`.
- **전체:** `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/design_critic.md`, 같은 플러그인의 `skills/egm-brainstorm/SKILL.md`, `docs/codex.md`.
- **전체:** `/Users/minholim/.codex/skills/.system/skill-creator/SKILL.md` — 비교 근거로 읽음.
- **부분 내용 검토·전체 기계 파싱:** `packages/svelte-ui/src/lib/shadcn/support.json`. 루트 구조, 대표 부품·참조 및 callback 구조를 확인하고 전체 392개 항목의 출력 크기를 계산했다. 모든 스키마의 의미를 전수 검토하지는 않았다. 파일 SHA-256은 `37cb7a89ab0686036bdaacc8b68e35e256f90dde00fedd7e0646de2e610d983a`.
- **행 수만 확인·내용 미독:** `packages/core/README.md`, `packages/svelte/README.md`.

한계: 실제 스킬·`inspect.mjs`가 없어 에이전트 성공률, 실제 토큰 사용량, 실행 지연은 검증하지 않았습니다. 파일 수정·빌드·워크트리 생성은 하지 않았으며 대화 기록·메모리·다른 검토 보고서는 조회하지 않았습니다.
