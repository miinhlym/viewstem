# T3 application·registry 독립 프로토콜 실험

M01–M07·N01–N05·K23·C03·C14·C16·C17을 작은 호스트 프로토콜로 실행한다. 실제 Viewstem registry/core/Store/공개 SDK의 구현이 아니다. [UI 실험](../t3-ui/README.md)의 projection, [State 실험](../t3-state/README.md)의 서비스 소유 셀, [T2 Query 실행기](../t2-query-races/README.md), 기존 URL `mergeOwned`를 **읽기 전용으로 재사용**한다. 변경 파일은 이 폴더뿐이다.

```sh
node experiments/t3-application/run.mjs
/opt/homebrew/opt/node@24/bin/node experiments/t3-application/run.mjs
node experiments/t3-application/browser-run.mjs
```

Node 22.21.1·24.19.0에서 각각 **29/29 프로토콜 검사**, Chromium 151.0.7922.34에서 **실제 DOM 검사 3/3 + pageerror 검사 1/1**을 실행했다. 결과는 [Node 22](results/node22.json), [Node 24](results/node24.json), [Chromium](results/chromium.json), 인수행별 clause 대응은 [coverage.json](coverage.json)에 있다. 각 결과에는 환경과 소스 SHA-256이 있으며 Chromium 결과는 실제 DOM 내용·Query 상태·commit→projection→paint→ack 순서도 기록한다. Node와 DOM 검사를 같은 성공 수로 합산하지 않는다.

관찰 경계는 다음과 같다.

- **구조 준비:** 주입 정의를 snapshot하고 필요한 종류의 참조만 찾는다. 정의 resolver는 여기서 호출할 수 있다. State 값·유지 계약·기존 서비스 셀 연결·URL 소유 충돌·후보 UI 전체를 검증한다. 준비 중 Query/코드 Action은 실행하지 않는다.
- **원자 commit:** State와 현재 구성을 함께 반영한다. 잘못된 값/구조/참조/유지 타입/소유권이면 이전 State·UI·URL 연결·진행 중 initial을 유지하며 부분 통지·cleanup은 없다. update는 기존 수명을 유지하고 replace는 옛 수명을 정리한다.
- **Query와 projection:** commit 뒤 기존 T2 실행기가 최초 실행 가능한 Query를 시작한다. 준비된 UI와 먼저 완료한 결과는 먼저 전달한다. 개별 실패는 새 화면을 유지하며 `queryErrors`에 포함한다. missing 외부 입력과 닫힌 gate는 waiting으로 남고 initial을 막지 않는다. 입력이 준비되면 이후 실행한다.
- **initial:** 각 적용 세대에 고정한다. core 경로는 최초 처리와 projection 전달까지, renderer 경로는 실제 DOM 반영 확인까지 기다린다. 교체·폐기된 initial은 CANCELLED이며 실패한 후보 준비만으로 이전 initial을 취소하지 않는다. 오래된 준비/응답/renderer ack가 새 화면을 바꾸지 못한다.
- **등록·변경·호스트:** `(kind,id)` 조회와 같은 종류 중복 거절을 실행한다. 미사용 등록은 Query/Action을 실행하지 않는다. A만 변경해도 B/공용 원본을 바꾸지 않고, DB·registry 수정은 기존 화면에 자동 추종하지 않는다. State/현재 구성/재사용 정의의 세 변경과 정의 추출을 구별하며 저장은 명시 서비스 함수가 수행한다. host fixture는 목록 공개와 호출 권한을 분리하고 UI/에이전트가 같은 변경 경로를 사용한다.

실험 구현에서 서비스 Query callback의 **동기 throw가 commit 이후 전체 적용 예외로 탈출하는 경계**를 보완했다. T2 요청 completion의 데이터 오류로 연결하여 configuration을 유지하고 정제된 `queryErrors`로 initial을 완료한다. 비동기 거절뿐 아니라 이 경우도 별도 fixture로 실행했다. 기존 T2 파일은 수정하지 않았다.

범위와 한계:

- `createStoreFixture`의 WeakSet brand는 이 실험이 생성한 StateProbe만 허용하는 **private brand fixture**다. 실제 라이브러리 Store의 brand/API가 확정되거나 구현됐다는 의미가 아니다. 같은 메서드의 duck type와 직접 생성한 unbranded StateProbe를 거절한다.
- 서비스 State 연결과 URL key 옵션은 private host 연결이다. URL 정리는 실제 `mergeOwned`를 URL 문자열 fixture에 적용하며 router/History 통합·지연 cleanup 실패는 여기서 새로 검증하지 않는다. 서비스 소유 State는 기존 StateProbe의 실제 셀로 확인한다.
- 유지 State 계약 비교는 동일한 schema 구조에 한정한다. 테스트는 number→string 같은 명확한 충돌을 사용하며 임의 JSON Schema의 의미적 호환성 판정 완료를 주장하지 않는다.
- 정적 inline 사례는 업무 View/Component를 inline으로 공급하고, terminal Text의 코드 계약/어댑터는 미리 등록한다. 서비스 정의 조회·Query callback은 제공하지 않는다. primitive가 core에 자동 설치된다는 뜻이 아니다.
- renderer의 private `isCurrent` guard는 실제 paint 직전에 적용한다. 실제 Chromium 검사는 기존 UI DOM 어댑터로 전달된 root를 그리고 별도 호스트 Query 상태 표시를 확인한다. 일반 Query 결과를 UI 표현식에 연결하는 완전한 renderer나 Svelte 구현이 아니다.
- 호출 권한은 trusted host가 발급한 객체별 grant와 public Action allowlist fixture다. 실제 서비스 인증·서버 권한 검증 완료를 주장하지 않는다. Action은 명시 Value 입력의 단일 코드 callback만 호출하며 동적 하위 호출/재귀 계약 K05에 의존하지 않는다.
- 전체 리소스 문법·모든 참조/순환·State/Query 포트·일반 Action 실행 관찰/비동기 수명·renderer 실패 정책·모든 스키마 호환성·서비스 저장/네트워크·다른 브라우저는 후속이다. 관련 acceptance의 **실행한 독립 fixture 증거**와 실제 제품 통합 완료를 구별한다.
