# Action 호출·수명 독립 실험

core/공개 SDK 구현이 아닌 순차 실행·수명 연결 모형이다. `node run.mjs node24.json`과 Node 22의 같은 실행으로 기본 23개를, `node child-calls.mjs child-calls-node24.json`으로 U35 하위 호출 16개를 검증한다. 별도 `boundaries.mjs`는 기존 후속 중단·취소 catch·retry·명시 Query 무공유 8개 묶음이다. Node 22/24에서 각각 23/23·16/16·8/8 통과했다. `node child-browser.mjs`의 실제 Chromium은 하위 호출/동기 취소 5개와 pageerror 검사까지 6/6다. 실제 판정은 각 results 보고서를 따른다.

State/포트와 기존 Query scheduler를 연결해 입력 snapshot·고정 대상·명시 output/void·If/Assert·완료한 효과 보존·연결별 중복 무시·취소·공유 대상 격리를 검사한다. U35의 native context는 `{inputs, signal, invokeAction}`이다. 문맥의 하위 호출은 직접/상호/await 이후/선언형 혼합 재귀를 검사하고 부모 취소를 이어받는다. 외부 invoke는 독립 실행이다. 대상·명시 입력·권한·출력을 재검증하고, 등록 추가로 활성 정의 identity가 바뀌어 스택을 우회하지 않게 유지한다.

부모 종료 뒤 보관한 하위 호출 함수는 CANCELLED이며 대기하지 않은 자손도 취소한다. 반환 Promise를 await하면 결과/오류를 받으며 코드의 명시 try/catch는 유지한다. 전체 runtime/Store 자동 주입이나 임의 신뢰 코드의 강제 종료는 제공하지 않는다.

독립 리뷰에서 중첩 인라인 native 등록 우회와 부모 Query 래퍼의 자식 취소 signal 유실을 재현했다. 인라인 Action 내부 전체를 검사하고, Query 재연결 시 조상과 자식 신호를 결합해 해당 refresh/retry ticket만 취소한다. pending 요청 추가 실행 차단·active ticket 취소·다른 대기자의 정상 요청·공유 Query 결과 보존을 실제 기존 scheduler로 검사한다. [수정 전 3개 실패와 소스](archive/u35-child-review-before/README.md)를 보존한다.

기존 K05 실패는 부모 관계를 전달할 수 없던 당시 API의 한계였다. [당시 소스·환경·22/23 결과](archive/u34-dynamic-reentry/README.md)를 보존하며, U35에서 문맥 하위 호출로 재현을 바꾸고 public 호출의 독립성은 별도 양성 검사한다. 과거 `results/dynamic-reentry-*.json`을 현재 코드 통과 증거로 사용하지 않는다.

[화면 수명 결합](../verification/action-ui-integration.mjs)은 실제 UIProbe의 조건/반복 확장과 ActionProbe 연결을 private adapter로 대조한다. when/on 제거·재생성·항목별 취소·Row 이동·실패한 화면 변경 보존·실제 State 쓰기로 자기 연결 제거를 검사한다. 실제 renderer, 일반 등록/서비스 권한 통합, production SDK 구현은 별도다.

자기 연결을 동기 제거한 콜백의 늦은 reject도 회수한다. native/Query/Variable 세 경로와 실제 Chromium에서 CANCELLED 및 처리되지 않은 오류 0건을 확인했고 [수정 전 증거](archive/u35-synchronous-cancel-before/README.md)를 보존했다.
