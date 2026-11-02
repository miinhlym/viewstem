# Svelte 렌더러 구현 인계

후속 U42: 권고 이름 전체를 적용했다. 이 문서의 이전 이름·제안·검증 수는 당시 기록이며, 현재 사용법과 새 검증은 [네이밍 적용 인계](public-api-naming-2026-11-02.md)를 따른다.

U39의 `@viewstem/svelte` 구현 요청에 따라 실제 core의 공개 API를 소비하는 Svelte 5 클라이언트 렌더러를 구현했다. U40에서는 `createRenderer()`로 core 직접 import 없이 시작하도록 정리했다. 기본 Component·Action·테마를 자동 등록하지 않는다. 공개 계약은 core Registry, 실제 UI 구현은 호스트가 명시 연결한다. 패키지 사용법·시그니처는 [README](../../packages/svelte/README.md)와 빌드된 공개 타입, 실제 실행 수·소스·산출물 해시는 [검증 결과](svelte-verification-results.json)가 소유한다.

U41의 후속 공개 API 축소에서는 core와 Svelte 공통 타입 노출을 함께 변경했다. 아래 “core 소스 변경 없음”은 U39–U40 당시의 범위다. 이후 호환성·현재 재실행은 [API 정리 인계](public-api-refactor-2026-11-02.md)를 따른다.

## 구현 범위와 완료 기준

| 범위 | 관찰 가능한 기준 |
|---|---|
| 명시 등록 | 자동 등록 없음, 코드 Component ID와 Svelte 구현 연결, 중복·없는 ID·선언형 덮어쓰기 거절 |
| 입력·이벤트 | 준비 상태와 readonly Value·State/Query 핸들 전달, payload 검증, 이벤트 전달·실제 false 반환·Action 취소 |
| 화면 구성 | named/empty/전달 slot의 작성자 문맥, inline/참조 Component, when 제거·재생성, repeat 재정렬과 새 수명 |
| 실행 변경 | update의 기존 인스턴스 유지, replace의 새 Registry·어댑터 주입, 잘못된 core 적용의 이전 화면 보존 |
| 초기 완료 | 준비된 부분의 점진 표시, 초기 Query 오류 보고와 재시도, 해당 세대의 DOM 반영 완료, 교체·해제 시 취소 |
| 소유권 | mount한 View와 내부 생성 Runtime 폐기, attach/직접 ViewstemView 자체는 구독·화면만 분리, 주입 Runtime·외부 Store·다른 Runtime의 View 보존 |
| 오류 | 노드별 렌더 실패 격리·새 projection 재시도, 정제된 공통 오류, 오래된 DOM 이벤트의 현재 readiness 확인 |
| 실제 소비자 | Svelte 앱 예제, 배포 tarball의 공개 진입점·타입·컴파일·브라우저 이벤트, NodeNext 타입 소비 |

core의 상태 엔진·Query·Action·값 계산을 복제하지 않는다. Svelte store는 읽기 전용 projection을 Svelte의 렌더링에 전달하는 구독일 뿐이다. DOM·Svelte 의존성은 새 패키지와 예제/검증 도구 안에 둔다. playground의 도구용 어댑터나 상태 inspector를 기본 제품 UI로 옮기지 않았다.

## 기술 구체화와 검토 수정

현재 `createRenderer()`는 빈 Registry·Runtime을 생성·소유하고 `createRenderer({runtime})`는 주입 Runtime을 빌린다. 별도의 자동 core 등록 대신 `registerComponent(id, implementation)`으로 구현만 연결한다. 일반 Svelte 앱은 `ViewstemView`를 사용하고 명령형 호스트는 `mount/attach`를 사용한다. 같은 capability·이벤트·State/Query 흐름을 사용하며 core 권한 검사를 우회하지 않는다.

실제 소비자 검증과 독립 검토에서 다음 경계를 확인하고 수정했다.

- 배포된 `.svelte.d.ts`를 NodeNext 소비자가 ambient 타입으로 처리하는 경우 공개 메서드 타입이 사라졌다. 패키지 진입점의 `Component<ViewstemViewProps, {settled}>` 타입을 명시하고 독립 tarball 소비자로 검증했다.
- 등록 집합을 연결 당시만 복사하면 이후 명시 등록한 Component를 `replace`로 주입할 때 화면이 비었다. core의 새 View lifetime에서 어댑터/코드 종류를 갱신하고, `update`의 기존 주입 집합은 유지한다.
- DOM 갱신은 batch이므로 화면의 이전 ready callback만 검사하면 core가 error로 바뀐 직후 Action을 실행할 수 있었다. 호출 순간 core snapshot에서 주소·세대와 준비 상태를 확인한다.
- Svelte boundary가 host 예외의 `then`을 읽기 전에 Proxy가 던질 수 있었다. 명령형 root는 공식 `transformError` 옵션에 패키지의 오류 변환 함수를 연결하며, 직접 `ViewstemView`를 호스팅하는 root도 이를 명시하도록 사용법·예제·테스트를 정렬했다. 임의 getter/message/stack을 오류 DTO에 복사하지 않는다. U39의 `transformSvelteError`는 U40에서 `transformError`로 정리했다.
- 어댑터 초기화 중 renderer.dispose가 재진입하면 null projection 접근과 늦은 attachment 문제가 생길 수 있었다. 빈 projection을 안전하게 처리하고 mount 직후 수명을 다시 확인해 CANCELLED와 정리 경계를 유지한다.

Svelte 5.57.3·svelte-check 4.7.8을 고정했다. 최신 `@sveltejs/package` 3.0.2는 TypeScript 6 peer를 요구해 설치가 거절됐고, 기존 TypeScript 5.9.3과 호환되는 2.5.8을 사용했다. 강제 peer 무시나 core TypeScript 변경은 하지 않았다. 공식 Svelte 문서·도구로 문법·패키징·오류 경계를 확인했다. RenderNode의 effect는 새로운 projection에 따른 boundary reset이라는 명령형 수명 처리이며, 일반 파생 값을 effect로 계산하는 용도가 아니다.

## U40 단일 패키지 진입점

사용자는 `@viewstem/svelte`만 import해서 사용하도록 수정하고, 패키지에 이미 드러나는 `svelte`를 함수명에서 생략하도록 요청했다. 미발행 API를 `createRenderer`, `Renderer`, `RendererOptions`, `Adapter`, `transformError`로 정리했다. 이전 `createSvelteRenderer` 등의 별칭은 제공하지 않는다. 패키지 이름과 실제 Svelte 컴포넌트 구현은 유지한다.

core는 Svelte 패키지의 일반 dependency로 옮겼다. 기본 생성은 기존 core의 팩토리만 호출하며, `registry`와 `runtime`은 같은 실행 집합을 가리킨다. `export type`으로 core 공통 계약을 재노출한다. Runtime 생성 옵션을 렌더러에서 전달할 수 있고, 기존 Runtime 주입과 생성 옵션을 혼용하면 타입과 실행 시 모두 거절한다. 외부 Store는 core 소유권 계약대로 보존한다.

내부 Runtime의 View·Query·Action은 renderer 폐기 시 즉시 취소한다. abort 콜백이 `dispose()`를 다시 호출해도 같은 Promise를 받는다. 진행 중 resolver와 모든 attachment 정리를 기다린 후 완료하며, 하나의 teardown 오류가 나머지 정리를 생략하지 않게 했다. 직접 `runtime.mount`로 만든 View도 Runtime 종료에 포함하지만, 다른 Runtime의 빌린 View는 보존한다.

회귀 검사는 기본 생성의 격리, 직접 생성 View의 Query·Action 취소와 재진입, 외부 Store·View 보존, resolver 대기·target 재사용, 혼합 옵션 거절을 추가했다. 배포 tarball 소비자는 `@viewstem/svelte`와 Svelte만 직접 의존하며 런타임·타입 모두 core import 없이 검사한다. 아직 미발행인 core의 설치 위치만 테스트용 로컬 tarball override로 지정한다. 첫 검사에서 폐기된 State 쓰기를 CANCELLED로 기대한 테스트는 core의 실제 계약인 REFERENCE_NOT_FOUND로 정정했으며 core 코드는 변경하지 않았다. 이전 U39 요약과 최초 실패 증거는 검증 기록에 구분 보존한다.

## 검증 경로

`npm run check:svelte`는 core/Svelte 빌드 → 소스·공개 소비자·예제 타입 검사 → 실제 Chromium 적합성 → 독립 npm tarball 설치·NodeNext 타입·브라우저 동작을 검사한다. 테스트가 skip/todo되거나 파일이 비어 있으면 실패한다. 정확한 test name과 실행 결과는 검증 JSON을 따른다. 제어된 RequestExecutor 사례와 실제 패키지·DOM 실행을 구분하며, 실제 서비스의 인증/CORS 적합성을 주장하지 않는다.

예제는 `npm run example:svelte`로 실행한다. `packages/svelte/example/`의 네 어댑터와 직렬화 가능한 View 정의를 통해 입력→Action→State→Derived→Label과 named slot·초기화를 보여준다. 예제는 tarball에 포함되지 않는다. 기존 playground와 별도 포트를 사용한다.

기존 core 소스·공개 타입·런타임 의존성은 변경하지 않았다. root manifest·lockfile에 Svelte 개발 도구와 workspace를 추가하고 CI의 Node 22/24 행렬에 `check:svelte`를 연결했다. core README의 후속 경로만 현재 패키지로 연결했다. 기존 실험·수정 전 기록을 보존하며 실제 재실행·재사용한 core/playground 결과는 검증 JSON에 구분한다.

## 남은 제한

- 기본 UI, Grid·차트·테마·디자인 시스템은 포함하지 않는다. 실제 DOM 컨트롤의 IME·접근성·준비 상태 표시는 호스트 어댑터 책임이다.
- ViewstemView는 core View를 빌리며 host-owned runtime·Store를 자동 폐기하지 않는다. 비동기 resourceResolver의 중단·timeout도 호스트가 소유한다.
- Svelte 5 클라이언트/Chromium을 검증한다. Svelte 4, SSR·hydration의 runtime 전달, 다른 브라우저·실제 모바일 입력·운영 부하 성능은 이번 완료 판단에 포함하지 않는다.
- 전체 임의 UI 코드의 sandbox가 아니다. 직접 호스팅한 Svelte root의 오류 정책은 호스트가 설정한다.
- 라이선스·npm scope·발행 문서 URL, 원격 CI와 공개 발행은 별도 후속이다. 이번 구현 요청으로 commit/push/publish를 수행하지 않는다.
