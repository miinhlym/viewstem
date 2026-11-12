# egm-structural — Maintenance & Coupling Brainstormer

- Status: **completed**
- Reviewer agent ID: `/root/goldfish_synthesis/structural_brainstormer`
- Native completion evidence: 해당 에이전트의 `FINAL_ANSWER` 수신.
- Mode: `BRAINSTORM`; conversation context: `fork_turns: none`
- Target: [원문 snapshot](review_input_snapshot.md), 원래 [루트 초안](../../../concepts_brief.md) 전체 138줄
- Input SHA-256: `ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`
- Persona: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/structural.md`
- Supplied standards: 없음
- 아래는 검토자가 반환한 보고서다. 코드 표기의 저장소 경로는 저장소 루트 기준이다.

## 반환 보고서

상태: **검토 완료. Blocker 0, Major 0, Nit 2.** 단일 진입 스킬과 작업별 참조 구성은 유지보수 관점에서 타당한 작업 가설이다. 문서 복제 금지, 공개 파일 사용, 버전 대응, 생성기·별도 validator 제외가 이미 명시되어 있어 구조적 분리를 추가로 요구할 근거는 찾지 못했다.

입력 SHA-256은 읽기 전후 모두 요청값과 일치했다.
`ca43013796584231a0e12d6f0ed246c353bea137dbd902c87db574b50f4eef4e`

1. **Nit — ID 단위 조회만으로는 “필요한 계약만 읽기”가 충분히 좁아지지 않는다.**
   대상: `concepts_brief.md` 83–85행.
   **사실:** 현재 메타데이터에서 부품 하나와 세 참조 집합을 완전히 펼치면, 공백 없는 JSON 기준 Input은 42,882 bytes, Button은 41,670 bytes, Dialog.Trigger는 40,661 bytes다. Input에는 입력 137개, callback 40개, 미지원 항목 302개가 포함된다.
   **실패 시나리오·추론:** 간단한 입력 폼에서도 여러 부품의 공통 HTML 속성과 금지 이벤트가 반복된다. 이후 이를 줄이려고 스킬에 수동 요약표를 추가하면 변경 추적 지점이 늘어난다.
   **완화:** 부품 선택 다음에 필요한 input/event/slot을 좁히는 조회를 허용하고, 생략한 정보의 조회 경로를 남긴다. 출력 축소를 위해 별도 지원 목록을 손으로 관리하지 않는 원칙을 추가하면 된다. 구체 CLI 형식은 후속 설계로 남겨도 된다.

2. **Nit — 조회 결과의 가공이 별도 의미 계약으로 굳어질 경계를 명확히 할 필요가 있다.**
   대상: `concepts_brief.md` 44행, 83–87행.
   **사실:** UI README 99행에서 callback schema는 전달되는 이벤트 전체가 아니라 callback 인자를 설명한다. DOM codec은 직접 payload로 쓰고 다른 callback은 `{value: argument}`로 감싼다. 실제 Input의 `value` 메타데이터에는 `schema:true`와 `uncertain:true`가 함께 있다. Trigger의 단일 DOM child 제한은 README 75행에 있으며, 선택한 부품 레코드의 slots에는 이름만 들어 있다.
   **실패 시나리오·추론:** 도구가 “입력 스키마·이벤트 payload·제한”을 정규화하면서 codec이나 불확실성 표시를 제거하거나, 문서의 동작 제약을 자체 표에 보충하면 스킬이 두 번째 계약 관리자가 된다. 이후 패키지 변경 때 잘못된 이벤트 연결이나 과도한 지원 판단이 남을 수 있다.
   **완화:** 원본 metadata의 codec·uncertain 등 의미를 보존하고, 도구가 계산한 표현과 원본을 구분한다. 메타데이터에 없는 동작 제약은 대응 revision의 문서로 연결한다. 이는 별도 서비스나 범용 해석기를 요구하는 사항이 아니다.

의미 있는 반론은 있다. ID별 완전 출력도 2.3MB 전체 파일보다 훨씬 작고, callback 포장 규칙도 현재는 단순하다. 따라서 위 두 항목 때문에 첫 도구를 복잡하게 만들 필요는 없다. 대표 폼에서 읽기량과 잘못된 payload 추론이 실제로 나타나는지 확인한 뒤 최소한의 선택 기능을 추가하는 접근이 가능하다. 문서와 색인만 제공하는 대안도 비교 기준선으로 유지할 가치가 있다.

읽기 기록은 다음과 같다. **별도 검토 표준은 제공되지 않았다.**

- 전체 읽음: `/Users/minholim/.codex/plugins/cache/egm/egm/0.1.0/agents/structural.md`
- 아래 저장소 파일 전체 읽음. 경로 기준은 `/Users/minholim/dev/minh/viewstem/`:
  - `concepts_brief.md` — 전체 138행
  - `AGENTS.md`
  - `docs/README.md`
  - `docs/VIEWSTEM-SPEC.md` — 긴 출력의 중간 잘림 부분을 추가로 읽어 전체 확인
  - `docs/handoff/docs-package-reference-2026-11-05.md`
  - `docs/handoff/open-contracts.md`
  - `packages/core/README.md`
  - `packages/svelte/README.md`
  - `packages/core/src/cel/supported-functions.json`

한계: 실제 스킬·도구는 아직 없으므로 위 실패 시나리오는 확인한 자료에서 도출한 위험이며 재현된 제품 결함이 아니다. 행동 평가·빌드·설치·발행은 수행하지 않았다. 대화 원문, 다른 검토자의 결과, 형제 산출물은 읽지 않았고 파일을 변경하지 않았다.
