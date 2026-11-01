# Viewstem 문서 지도

이 문서 묶음은 **2026-10-28까지의 Viewstem 설계 결정**을 프로젝트 내부에서 이어서 사용할 수 있도록 이관한 것이다. 이후 설계·구현 논의의 기준은 이 저장소의 문서와 코드다. 이전 채팅이나 외부 Page를 다시 읽지 않아도 현재 계약과 다음 작업을 파악할 수 있게 구성했다.

2026-10-29 적대적 리뷰로 기존 승인 9건의 누락·축소를 복원했다. [복원 범위·독립 재리뷰·검증 기록](handoff/semantic-review-2026-10-29.md)은 10/28 파일 이관 검사와 구별한다. 구현·런타임 테스트 완료 기록이 아니다.

추가 재평가 후 Query 실패 의미를 E52로 복원하고, 등록 식별 `(kind, id)`는 이번 사용자 개선 요청 U01에 따라 명확히 했다. 과거 승인 복원과 현재 명확화를 구별한 [추가 보완 기록](handoff/semantic-review-2026-10-29.md#추가-재평가-후-두-항목-보완)을 함께 읽는다.

전체 보관 대화 1,530개를 분담 전문 읽기하고 방 기록 회수 근거를 추가 대조한 뒤 E53–E69을 보완했다. [전체 원문→계약 대응표](handoff/source-contract-matrix.md)는 현재 의미·이유·예외·대체 관계·인수 위치를, [열린 구현 과제](handoff/open-contracts.md)는 실제 미결과 영향 범위를 남긴다. 이후 담당자가 과거 대화의 요약만 다시 추측하지 않도록 두 문서를 함께 유지한다.

## 현재 인계 상태 · 2026-11-02

U37 요청으로 구현 보류를 해제하고 `packages/core`의 실제 JS/TS 패키지를 구현했다. Node 22·24에서 각각 1,060개 검사와 core 인수 216개의 실제 실행 대조, Chromium·독립 tarball 소비자 검증을 마쳤다. [구현 인수인계](handoff/core-implementation-2026-11-02.md), [제품 인수 대응표](handoff/core-acceptance-coverage.json), [검증 결과](handoff/core-verification-results.json)를 현재 상태로 사용한다. Svelte·Dart/Flutter·선택 차트 제품 및 공개 발행은 후속이다. 아래 날짜별 실험 기록은 보존하며 현재 core 미구현으로 해석하지 않는다.

## 처음 참여했다면

1. [최종 설계 명세](VIEWSTEM-SPEC.md)로 전체 모델과 확정된 책임 경계를 읽는다.
2. [구현 시작 인수인계](handoff/implementation-start.md)에서 현재 상태와 첫 실행 단위를 확인한다.
3. 구현할 리소스의 상세 계약을 아래 표에서 찾아 읽는다.
4. [인수 검증 행렬](handoff/acceptance-matrix.md)에서 해당 변경이 만족해야 할 기대 동작을 찾는다. 이 목록은 실행된 테스트 결과가 아니다.
5. 이유가 궁금하거나 과거 안과 충돌하면 [결정 등록부](history/decision-register.md)와 [이전 설계 이관표](history/patchboard-migration.md)를 확인한다.

## 현재 명세

| 문서 | 찾아볼 내용 |
|---|---|
| [전체 계약](VIEWSTEM-SPEC.md) | 목적, 7종 리소스, 공통 외피, 참조, 포트, 소유권, 실행 경계 |
| [Datasource·인증](spec/01-datasource-auth.md) | HTTP 설정, 헤더/파라미터, 비밀값, Login, 인증 7가지 예시 |
| [Query](spec/02-query.md) | sources, queryRef, transform, join/concat, 실행 인스턴스 |
| [Variable·Type](spec/03-variable-type.md) | CEL, 표현식, JSON Schema, schema/typeRef |
| [Action](spec/04-action.md) | 단계, 분기·단언, State 변경, Query 갱신, 결과/void, 코드형 확장 |
| [Component·View](spec/05-component-view.md) | render, slots, on, when, repeat, Grid와 수명 |
| [연결 예시](spec/06-composition-examples.md) | 리소스들이 함께 실행되는 JSON 흐름 |
| [호스트 연결 예시](spec/07-host-integration.md) | 확정 계약과 아직 제안인 SDK 문법의 구분 |
| [구현 준비·적합성](spec/08-readiness-conformance.md) | 구현 전 구체화할 경계와 대표 시나리오 |
| [이전 승인 계약 보존](spec/09-preserved-contracts.md) | StateStore 주입/관찰, URL, reaction, polling, Query 콜백 Set/Map 변환, 날짜, 차트 요구 |
| [값 상세](spec/10-value-contracts.md) | State의 missing 읽기·undefined·숫자 범위·표현·정규화·미지원 값/순환 거절·literal/escape·시간 의존 계산·타입별 동등성·원본 격리·안정 읽기 snapshot·날짜 |
| [선택 차트](spec/11-optional-charts.md) | core와 구별하는 차트 범위·series/data 소유·Y 검증·별도 적합성 백로그 |

## 실행 검증의 현재 위치

U15에서 [T1 실행기·값 경계 실험](handoff/t1-experiment-2026-10-29.md)을 수행했다. [재실행 명령과 코드](../experiments/t1-values/README.md), 후보별 불일치와 남은 작업을 남겼으며, core 전체 구현이나 인수 백로그 전체 통과는 아니다.

U17에서 [T2 Query 지연 응답·취소 경합 실험](handoff/t2-query-races-2026-10-29.md)을 수행했다. [재실행 코드](../experiments/t2-query-races/README.md)와 실제 결과를 남겼으며 당시에는 실제 HTTP/URL·core/renderer 연결을 포함하지 않았다. U29에서 [Query–실제 HTTP 연결](handoff/t2-query-http-2026-10-30.md)의 39개 경합 사례와 4개 고의 결함을 Node 22/24에서 검증했다. U30에서 [복합 Query·완료 기준 polling](handoff/t2-composite-polling-2026-10-30.md)의 독립 실험과 실제 HTTP 결합을 검증하고, 재사용·오류 위치·owner cache 정리 누락을 수정했다. U31에서 [autoRefreshWhen 재개 정책](handoff/t2-polling-resume-2026-10-30.md)을 확정하고 즉시 갱신·진행 중 한 건 결합·완료 후 주기를 검증했다. 전체 등록/스키마·실제 core/URL/renderer 연결은 후속이다.

이어 U18에서 [T2 URL 지연 쓰기·복원 경합 실험](handoff/t2-url-races-2026-10-29.md)을 Node와 실제 Chromium History에서 수행했다. [재실행 코드](../experiments/t2-url-races/README.md)와 부분 검증 범위를 남겼으며, 실제 HTTP·URL의 core/renderer 통합·다른 브라우저는 후속이다.

U20–U27의 HTTP·인증·오류 정제·동적 값 보완과 CEL 크기 검증은 [HTTP 이력](handoff/t2-http-boundary-2026-10-29.md)에 있다. U28에서 baseUrl·method·Login request 전체 평가와 공통 경로 문법을 보완하고, [현재 HTTP/Login의 동적 위치 17개 전체](handoff/t2-path-audit-2026-10-30.md)를 검사해 통과했다. 기존 계약의 버그는 추가 승인 없이 수정·검증한다. 미구현 core·State/Action/renderer의 경로 평가는 이번 통과 범위에 포함하지 않는다.

U32/U33에서 [복합 Query·URL 교체·날짜 경계](handoff/boundary-followup-2026-10-30.md)를 추가 검증하고 명시 null·입력 escape·Concat·늦은 URL 정리·사전 검증·날짜 스키마/범위 누락을 수정했다. URL 정리 실패도 새 화면 교체를 완료하고 동기화 오류를 보고하는 정책을 확정했다. 현재 CEL 패치 진행 상태는 [U34 전체 진행표](handoff/verification-ledger.md)를 따르며 core 통합 미완료와 구별한다.

## 배경과 이력

- [결정 등록부](history/decision-register.md): 채택·대체·기각·보류·구체화 필요의 구분.
- [Patchboard에서 Viewstem으로 이관](history/patchboard-migration.md): 옛 요구를 어디에 보존했는지, 무엇이 명시적으로 대체됐는지.
- [근거 색인](history/evidence-index.md): 원본 E01–E42와 복원 보충 E43–E69, 현재 프로젝트 결정 U01–U37을 구별한다. 보관 원문 직접 대조와 방 기록 회수 요약도 구별하며, 로컬 원문은 명세 해석의 필수 외부 의존성이 아니다.

## 상세 대화 기록

로컬 프로젝트의 [context-archive](../context-archive/README.md)에 관련 대화, 원본 명세 스냅샷, 검색/수집 범위와 누락 한계가 있다. 이 폴더는 기본 Git 추적 대상에서 제외한다. **공개 저장소를 새로 clone한 환경에는 이 로컬 원문 폴더가 없을 수 있다.** 공개 가능한 현재 계약·결정 배경·구현 과제는 이 `docs/` 안에 남긴다.

추가 회수 자료는 로컬 `context-archive/recovered-evidence-2026-10-29.md`에 기존 원문을 바꾸지 않고 검증 요약·명시 인용·ID로 별도 보존한다. 원문 전문이나 transcript 메시지 수의 증가로 표시하지 않는다.

과거 원문에는 당시만 유효했던 제안과 이후 기각된 JSON이 포함된다. 원문에 등장했다는 이유만으로 현재 기능으로 구현하지 않는다. 누락된 대화는 추정하여 원문으로 채우지 않는다.

## 문서 상태를 읽는 방법

- **확정:** 현재 따를 계약.
- **구체화 필요:** 상위 방향은 선택됐지만 필드/오류/경계 등을 구현 가능한 수준으로 닫아야 하는 부분.
- **이전 승인·통합 대조 필요:** 폐기하지 않은 과거 의미를 최신 구조에 맞춰 이관해야 하는 부분.
- **구현 제안:** 예시 SDK나 내부 구조. 사용자 승인 없이 확정으로 격상하지 않는다.
- **대체·기각·보류:** 현재 기본 구현을 지시하는 계약이 아니다.

최신 확정 계약과 과거 기록이 다르면 명시적으로 대체된 최신 결정을 적용한다. 실제 충돌이 설명되지 않았다면 임의로 한쪽을 지우지 말고 구현 영향과 근거를 기록한다.

## 이후 유지 방법

새 결정은 해당 현재 명세와 결정 이력을 함께 갱신한다. 테스트가 생기면 인수 검증 행렬에 실제 테스트 위치와 실행 결과를 연결한다. 사용자와 프로젝트 안에서 합의한 변경은 이관 시점의 외부 Page보다 최신 기준이 된다. 이관 자체가 구현·테스트·배포 완료를 뜻하지 않는다.

U34–U35의 [전체 검증 진행표](handoff/verification-ledger.md)와 [224개 인수 항목 목록](../experiments/verification/coverage.json)은 구현 전 검증의 기준선이다. 실제 core 구현에서는 같은 기대값을 제품 코드 대상으로 옮겨 검증하며, 새로운 제품 선택이 필요한 경우만 사용자에게 묻는다.
