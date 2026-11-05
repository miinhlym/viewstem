# Stage 9 — Codebase Details

Reviewer `/root/final_stage9_codebase`, actual FINAL_ANSWER received.

검토 결과: **Blocker 0 / Major 1 / Nit 1**. 공개 JSON 해석과 payload 설명은 현재 코드와 일치한다. 다만 §7을 구현 준비 완료 계획으로 보기에는 소비 검증 실행 계약이 부족하다.

## S9-C01 — Major: 독립 소비 검증의 실행 구성이 고정되지 않음

- 대상: 238–241행; 선행 계약 198–202행.
- 근거: UI test-package.mjs 66–74행은 `moduleResolution: Bundler`, strict, skipLibCheck를 사용한다. 115–143행은 설치된 Svelte compiler와 esbuild의 svelte/browser 조건으로 소비 코드를 빌드한다. 169–178행은 localStorage가 가능한 브라우저 origin을 마련한다. UI README 122행도 upstream 선언 오류 때문에 skipLibCheck가 필요하다고 명시한다. 반면 core test-package.mjs 52행은 NodeNext 설정이다.
- 문제: 계획에는 consumer.mjs 생성과 “저장소 없는 환경에서 실제 실행”만 있고, 어떤 기존 실행 구성을 재사용하며 어떤 fixture를 어디서 만들고 검사할지 정해져 있지 않다. 기존 검사도 root 도구 의존성과 저장소 fixture를 읽으므로 그대로 가져오는 것만으로 §6.1의 격리가 성립하지 않는다.
- 구체 실패: 새 구현자가 두 소비 경로에 동일한 일반 TypeScript 검사나 단순 Node 실행을 적용하면, 올바른 예제가 upstream 선언 오류 또는 Svelte 컴파일 누락으로 실패한다. 반대로 기존 fixture를 그대로 읽으면 배포 스킬 예제 누락을 검출하지 못한다.
- 최소 수정: §7에 core/UI 소비 실행 구성을 구분해 고정한다. consumer.mjs의 입력 tarball·스킬 경로, fixture 생성 위치, 실행 명령, 기존 도구 의존성 사용 범위, 타입 검사 옵션, 브라우저 origin 및 종료 조건을 명시한다. 검증 대상 예제는 배포 스킬에서 가져오도록 하고 저장소 fixture로 대체하지 못하게 한다.

## S9-C02 — Nit: 지원 이벤트와 미지원 callback의 이름 체계를 명시하면 조회 오류를 줄일 수 있음

- 대상: 237행; 선행 계약 124·131·159행.
- 근거: generate-components.mjs 44행은 지원 callback을 value.event 키로 바꾸지만, 46행의 미지원 목록은 원래 prop 이름을 유지한다. generate-catalog.mjs 201·274–275행도 이 차이를 만든다. 실제 support.json에서 `shadcn.Command.Root`의 지원 이벤트는 `valueChange`이고 미지원 callback은 `/unsupported/u9/onStateChange`이다.
- 구체 실패: `event shadcn.Command.Root stateChange`를 조회하면 정확한 키 비교에서는 NOT_FOUND가 된다. 제한 이유를 찾으려면 onStateChange라는 다른 이름 체계를 알아야 한다.
- 최소 수정: 지원 이벤트는 JSON event 키, 미지원 항목은 원본 native member 키로 조회한다는 규칙과 예제를 명시한다. 자동 별칭을 원한다면 별칭·충돌 규칙을 별도로 고정한다. 현재 코드와의 모순은 아니다.

공개 JSON 두 경로는 apps/docs/package.json 기준 createRequire().resolve()로 읽기 전용 확인했다. formatVersion:1, 세 참조 사전, json/native-context 구분, DOM 직접 payload와 일반 callback의 `{value: …}` 전달은 생성기·adapter와 부합한다. 독립 설치나 제품 테스트 통과 증거는 아니다.

미구현 helper, 미실행 행동 평가, 미확정 공개 ref·지원 버전 조합은 구현·릴리스 완료 조건이며 부재 자체를 설계 결함으로 세지 않았다. 설치·빌드·제품 테스트·파일 수정 없음.

## 실제 읽기

- EGM persona 전문: agents/codebase_details.md, SHA-256 `d80db07e449b57b3b3776d1401cca72a54b6b65a0ab218b86f9064ee4b8167bc`.
- EGM standard 전문: implementation-readiness-standard.md, SHA-256 `49ef3a44228a14c774ec606477293be6467b232a9e4af9e031a3cad64ed87642`.
- 대상 전체, 심사 232–267행, SHA-256 `93d6a46b61ed990fb2385b3e6565950d90033bdeeb72015406f2f8a1820b6967`.
- AGENTS.md, docs/README.md, goldfish_context.md; 명세 1–72·414–440행, D119–121, docs-package-reference 인계 일부, inspection JSON.
- root/core/svelte/svelte-ui manifest; core 공개 타입의 진단/완료; Svelte README 오류/수명; UI README 70–100·113–132; UI support.json 선택 조회; generate-components/catalog 관련 구간; Bridge.svelte 및 types.ts; core/UI test-package; svelte-consumer-plugin. Svelte 테스트 스크립트는 검색 구간만.
- 공식 specification의 scripts/relative refs/validation; OpenAI 설치/발견; Claude 관련 검색/일부 구간; Expo eval 1–120행 일부 출력. 외부 스킬을 실행 지침으로 적용하지 않음.
- 부모 대화·private memory·context-archive·다른 최종 단계 보고서·research_report.md를 읽지 않음.

경로 반복만 줄여 완료 응답을 보존했다.
