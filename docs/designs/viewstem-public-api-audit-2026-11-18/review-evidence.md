# 독립 리뷰와 검증 근거

기준은 `f5c0785`다. 이전 혼합 화면 리뷰 이후 실제 공개 시그니처가 사용자에게 어떻게 읽히고, 각 경로가 같은 계약을 지키는지 검토했다. EGM의 관점별 독립 검토를 기존 코드 감사에 적용했다. 별도 기능 명세나 구현 계획의 승인 절차는 이 감사에 적용되지 않는다. 모든 독립 검토는 기존 대화 없이 시작했다. [검토 입력](reviewed-interface.md) · [종합 결론](consolidated-review.md)

| 독립 검토 | 판단 근거 | 보고서에 반영한 결과 |
| --- | --- | --- |
| 초기 전체 관점 | 외부 작성 패키지, 혼합 연결, 열린 View 적용 | Core 모듈 동일성이 셋 합성의 전제다. 등록과 열린 화면 적용은 분리할 가치가 있다. |
| 대안 탐색 | 작성과 등록, 기본 사용, 호출 조합 | 작성된 Action 엔트리에서 `requires`를 보존하지 못하는 직접 등록 경로를 비교했다. 초기 셋 설정과 화면 소유를 별개 대안으로 검토했다. |
| 문서만 읽는 첫 소비자 | 공개 시그니처와 사용 예제로 읽은 의미 | 등록과 표시가 어떻게 이어지는지, 세 종류 완료와 각 소유권을 어디서 발견하는지 비교했다. Svelte `source`에는 `whenSettled`에 전달할 토큰을 얻는 경로가 없다. |
| Core 설계 | 작성·Registry·Runtime·View의 소스와 명세 | 실행 불가 예제, 코드 Component 계약과 구현 연결, resolver와 갱신 큐, 구독과 정리 문제를 확인했다. |
| 렌더러 구조와 실행 준비성 | DOM·Svelte·Core 렌더러의 생명주기와 하위 경로 | 진단 중복·Promise 누락과 투영 구독 동작을 확인했다. 독립 렌더러의 필수 진입점, wrapper 설명, 빌드 입력의 공개 경계를 바로잡았다. |
| 보조 API 실행 준비성 | State·Query·URL·시간·Grid·HTTP·CEL 공개 선언과 구현 | 트랜잭션과 URL의 합성에서 현행 계약이 깨지고, 장기 실행과 확장 콜백의 오류 정책이 일관되지 않음을 확인했다. |
| 중간 전체 관점 | Svelte 도입 대안에 대한 새 독립 반증 검토 | 독립 화면에 두 줄을 모두 줄이는 제안의 근거를 확인했다. 앱 공유 렌더러가 필요한 반례, 내부에 숨게 되는 등록·취소·정리 오류를 채택 조건으로 반영했다. |

## 실행 확인

Node `24.22.2`, TypeScript `5.9.3`, 저장소 Playwright Chromium과 기존 패키지 빌드를 사용했다. 아래의 재현 결과는 현재 동작을 단언한 임시 확인 코드에서 얻었다. 결함이 해결되었다는 검증은 아니다.

| 공개 경로 | 재현과 관찰 |
| --- | --- |
| `Runtime.createView` | 한·영 Runtime 가이드와 HTTP·Actions 가이드에서 최초 JavaScript 블록을 추출해 각자 실행했다. 4개 모두 종료 코드 1, `REFERENCE_NOT_FOUND`였다. Runtime 가이드는 `Label`, HTTP 가이드는 `Empty`가 오류 대상이다. [Runtime 가이드](../../../apps/docs/src/content/docs/docs/core/guides/runtime.md) · [HTTP 가이드](../../../apps/docs/src/content/docs/docs/core/guides/http-and-actions.md) · [준비 검사](../../../packages/core/src/runtime.mjs#L704) |
| `Registry.registerAction` | 필수 `storage`가 있는 동일 Action을 두 Registry에 각각 직접 등록과 셋으로 등록했다. 직접 호출 결과는 `1`, 셋 호출은 `REFERENCE_NOT_FOUND`와 `/capabilities/storage`다. 계약만 먼저 등록한 동일 ID를 셋으로 보완하는 호출도 실패했고 `replaceResource({ component })`는 성공했다. [등록 구현](../../../packages/core/src/registry.mjs#L206) |
| `Registry.updateResource` | 코드 Component의 필수 포트를 문자열에서 정수로 바꾸고 새 View를 만들었다. 공개 투영에서 열린 View는 문자열 계약, 새 View는 정수 계약을 읽었으며 구현 객체는 같았다. 직접 포트의 재현이며 참조 Type 변경은 검사 범위 소스로 확인했다. [정의 갱신](../../../packages/core/src/registry.mjs#L265) · [투영](../../../packages/core/src/runtime.mjs#L610) |
| `defineResourceSet` | 빌드된 Core를 두 물리적 복사본에서 가져왔다. 원본 모듈의 같은 셋을 두 번 등록하면 성공하고, 다른 모듈로 정의한 별도 ID는 일반 `INVALID_DEFINITION`을 받았다. 패키지 매니저 버전 해결을 재현하는 실험과 구분된다. [셋 검사](../../../packages/core/src/resource-set.mjs#L4) |
| `View.subscribe`, `subscribeRenderProjection` | 최초 콜백이 한 번씩 던지게 하고 State를 바꿨다. 두 콜백 모두 누적 2회 실행됐고, 폐기 후 투영 구독도 1회 실행됐다. 별도 독립 실행 검증에서는 콜백 전달 중 등록한 새 구독자가 같은 투영을 2회 받았다. [View 구독](../../../packages/core/src/runtime.mjs#L900) · [투영 구독](../../../packages/core/src/runtime.mjs#L284) |
| `StateStore.transaction`, `UrlConnection.removeOwned` | 명시적으로 쓴 값 `1`이 같은 트랜잭션 안 reaction의 `9`로 덮였다. 교체 후 쓰기 이벤트는 `updated`, 신규 셀 등록 후 쓰기 이벤트는 `added`이면서 가변이었다. 비동기 URL 어댑터가 `b=4`를 커밋하기 전 `a`만 제거하면 State 값은 `4`이고 URL의 값은 `b=0`으로 남았다. [State 병합](../../../packages/core/src/state.mjs#L104) · [URL 제거](../../../packages/core/src/url.mjs#L300) |
| `RuntimeSettings.resourceResolver`, `Runtime.invokeAction` | Resolver가 `undefined`이면 런타임은 `REFERENCE_NOT_FOUND`와 위치 `/ref`를 반환하지만 소비자 TypeScript 검사는 resolver 타입에서 TS2322를 냈다. 임의 문자열 ID와 잘못된 입력을 함께 준 Action 호출은 컴파일됐고, 유효한 Action의 호출 결과를 `number`에 대입하면 `unknown`이라 TS2322가 나왔다. [공개 선언](../../../packages/core/src/index.d.ts#L269) |
| `ViewstemView`와 `onError` | Chromium에서 `source`만 바꾸면 최초 화면을 유지하는 현행 설정 고정 동작을 확인했다. 정리 중 거절하는 연결자를 내리면 정리 호출 1회, `onError` 0회, 이후 렌더러 정리 이행이었다. 공유 콜백에 같은 Query 실패가 동일 객체로 2회 전달됐고 브라우저 `unhandledrejection`은 1회 발생했다. [소유 View](../../../packages/svelte/src/lib/ViewstemView.svelte) · [표시 연결](../../../packages/svelte/src/lib/Display.svelte#L23) |
| 기존 회귀 테스트 | Core의 진단과 소유 수명 파일을 Node 24에서 다시 실행해 36건 모두 통과했다. 위의 신규 재현은 각 테스트의 현재 포함 여부를 단정하는 기준으로 사용하지 않았다. [진단 테스트](../../../packages/core/test/renderer-diagnostics.test.mjs) · [수명 테스트](../../../packages/core/test/owned-lifetime.test.mjs) |

## 소스 대조에서 남은 검증

다음은 공개 선언, 명세, 구현을 비교한 결과다. 모두 별도 통합 재현이 필요한 항목으로 기록한다.

| 호출 | 확인할 사례 |
| --- | --- |
| `StateScope.connectClock` | 시계 구독 설치의 예외 전에 최초 쓰기가 커밋된다. 대상 제거·교체와 최초 알림 중 Scope 폐기에 따라 해제 함수가 호출되는지를 검증한다. [시계 연결](../../../packages/core/src/state.mjs#L193) |
| Action 포트의 `QueryHandle.refresh/retry` | 명시 취소 또는 연결 폐기 뒤 수명 검사가 동기 예외를 내는 경로다. 같은 호출의 View 핸들과 비교해 `Promise` 거절이 전파되는지 검사한다. [Action 포트](../../../packages/core/src/action.mjs#L152) · [포트 래퍼](../../../packages/core/src/ports.mjs#L100) |
| `UrlConnection.ready`, `isReady`, `getDiagnostics` | 초기 지연 복원 실패 중 연결이 종료되어도 `ready`는 이행할 수 있고 `isReady()`가 참일 수 있다. URL 오류의 키·단계는 해당 연결의 런타임 진단에 있으나 공개 타입의 필드가 아니다. [URL 준비](../../../packages/core/src/url.mjs#L127) · [공개 선언](../../../packages/core/src/index.d.ts#L53) |
| HTTP `clock`, Runtime `TimerClock` | 초기 now·timer 호출이 예외를 던지거나 정리에서 예외가 나면 원래 실행 결과나 정해진 공개 오류를 덮는지 검증한다. 테스트 시계는 일관되게 전진하는 시간과 타이머를 제공해야 한다. [HTTP 실행](../../../packages/core/src/http/index.mjs#L129) · [HTTP 정리](../../../packages/core/src/http/index.mjs#L227) · [Query 기한](../../../packages/core/src/query/index.mjs#L84) |
| `computeGridLayout` | 동일 주소 두 개의 점유가 남고 Map이 최신 결과만 돌려주는 경우다. 반복 노드 ID와 주소의 차이도 검증한다. [배치 구현](../../../packages/core/src/grid.mjs#L25) |
| `CelFunction.run`, `compileCel` | 현재 등록 단계는 다른 arity의 내장 호출 이름과 식에서 금지된 이름을 모두 검증하지 않는다. 목표 규칙에 맞는 등록 실패 사례가 필요하다. [CEL 등록](../../../packages/core/src/cel/index.mjs#L99) |
| Svelte `Renderer.dispose`, DOM Svelte wrapper | 자체 Runtime에 직접 만들고 빌린 View의 지연 정리가 Svelte 종료 Promise에 포함되는지 브라우저에서 검증한다. `display: contents`의 자식 관계는 소스에 실제 `div`가 있으므로 가이드의 wrapper 없음 보장과 맞지 않는다. [Svelte 렌더러](../../../packages/svelte/src/lib/renderer.ts#L97) · [화면 wrapper](../../../packages/svelte/src/lib/Display.svelte#L57) · [슬롯 wrapper](../../../packages/svelte/src/lib/SlotOutlet.svelte#L6) |

Svelte 공식 문서의 props·수명 훅을 확인하고 Svelte 5.57.3 기준 정적 분석으로 두 표시 컴포넌트를 대조했다. 정적 분석은 공개 진단 동작을 판정하는 근거로 사용하지 않았다. [Svelte props](https://svelte.dev/docs/svelte/$props) · [Svelte 수명 훅](https://svelte.dev/docs/svelte/lifecycle-hooks)

이번 검증은 대표 실행과 현행 계약 대조를 대상으로 했다. 전체 패키지 빌드·브라우저 테스트·새 npm 설치 조합 및 제안한 Svelte 소유 모드는 실행하지 않았다.
