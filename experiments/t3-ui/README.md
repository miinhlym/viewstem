# T3 UI 독립 계약 실험

`U01–U13`, `K21`과 UI 동적 값·State.initial·A14·K01의 Component 부분을 작은 등록기·UI 수명 모형·DOM 어댑터로 실행한다. **Viewstem core, 공개 SDK, Svelte renderer 구현이 아니다.** Row/Text/Input/Grid는 이 실험이 명시 등록하는 테스트 Component이며 자동 제공 제품 기능을 뜻하지 않는다. 상세 대응은 [coverage.json](coverage.json)에 있다.

```sh
/Users/minholim/.nvm/versions/node/v22.21.1/bin/node experiments/t3-ui/run.mjs
/opt/homebrew/opt/node@24/bin/node experiments/t3-ui/run.mjs
/Users/minholim/.nvm/versions/node/v22.21.1/bin/node experiments/t3-ui/browser-run.mjs
```

Node 22.21.1·24.19.0에서 각각 **158/158 모형 검사**, Chromium에서는 **같은 모형 158/158 + 실제 DOM 9/9 + pageerror 검사 1/1**을 실행했다. 환경별 결과는 [Node 22](results/node22.json), [Node 24](results/node24.json), [Chromium](results/chromium.json)에 있으며 실행 시각, 실제 버전, 대상 소스 SHA-256을 포함한다. Chromium 결과의 DOM 행에는 실제 형제 순서·텍스트·픽셀 사각형·Action 상태 표시도 기록한다. 서로 다른 환경의 같은 모형 검사를 별개 계약 수로 합산하지 않는다.

재실행은 기존 `t1-values`의 Schema adapter와 lockfile, `verification`의 esbuild, `t2-url-races`의 Playwright/설치된 Chromium을 사용한다. 의존성을 새로 설치하지 않았다. browser runner는 임시 bundle을 이 폴더에 만들고 종료 때 제거한다.

모형이 검증하는 동작:

- required 슬롯은 키 존재로 검사하고 `[]`를 허용한다. 전달·재전달된 슬롯은 작성자 문맥·선언 ID·순서를 유지한다. 실제 Row DOM은 여러 자식을 직접 가로 배치하며 암묵 Column을 넣지 않는다.
- payload를 기존 Schema adapter로 정규화·검증한 뒤 명시 inputs만 Action callback으로 전달한다. 잘못된 타입·추가 필드·native Event·클래스형 State/Query handle은 callback 0회다. 공개 emit도 재검증하며 자동 bubbling은 없다.
- `when:false`는 정적 구조·참조 검사를 통과해야 하지만 동적 inputs·Component 생성·Query 시작 spy를 건너뛴다. 재생성은 새 수명이다.
- repeat는 전체 items의 typed key를 먼저 검사한 뒤 항목별 when을 평가한다. reorder는 상태를 유지하고 remove/readd는 새 수명이다. 숨겨진 항목의 중복 key와 중첩 as shadowing도 거절하고 형제 별칭은 허용한다. 내부 Component에 repeat 문맥을 암묵 주입하지 않는다.
- 인스턴스 정체성은 owner·노드 ID·반복 조상/key·정의로 구성한다. Row 재배치와 입력 변경은 유지하고 다른 owner/정의는 새 수명이다. Row 아래 중복 노드 ID, 실제 반복·다중 슬롯 투영의 on 조회 ID 중복을 거절한다.
- 미사용 선언형 정의·인라인 안의 자기/상호 포함 순환도 등록 시 거절한다. 등록만으로 Query를 시작하지 않는다.
- Grid는 직접 선언/템플릿 ID를 확인하고 활성 fixed 전체를 먼저 예약한다. 자동 항목은 원래 확장 순서대로 전진하며 전체 사각형을 검사하고 dense 되채움을 하지 않는다. 범위·겹침·부분 좌표·반복 고정 좌표를 거절한다. 숨겨진 선언의 layout ID는 유효하며 공간을 쓰지 않는다. 실제 DOM/CSS 픽셀 위치와 원래 읽기 순서를 별도로 확인한다.

실험 내부에서도 inline 수정의 정적 검사 캐시와 같은 수명의 이벤트 참조 유지에 회귀 검사를 둔다. 전체 UI 계획이 실패하면 기존 tree를 유지하고 준비 중인 Query 시작 spy를 호출하지 않는다.

U34 후속에서 실제 계약 위반을 재현하고 수정했다. [수정 전 archive](archive/u34-dynamic-before/README.md)는 원본 UI 소스·종전 44/52개 결과와 Node 22/24의 재현 **9개 모두 실패**한 결과를 보존한다. 배열 length/비정규 인덱스·잘못된 Pointer 허용, owner 루트 노출, concat 부재, 혼합 표현식 수용, State.initial 미평가·missing/순환 누락이었다.

[value-evaluator.mjs](value-evaluator.mjs)는 기존 HTTP 평가기의 `pointerKeys/expressionKind/dataEntries/validateTemplate`을 재사용하는 별도 동기 평가기다. 공통 **40개 표현 fixture**를 기존 HTTP 비동기 평가기와 실제 대조한다. own 속성·정규 배열 인덱스, `~0/~1`, `@@` 한 번 해제, 반환/native 데이터 비재실행, concat/formatString·`$$`, missing/타입 오류, 혼합/미등록 함수·루트 거절을 확인했다. owner/secrets/auth/steps/response/slots는 일반 UI 값 경로로 읽지 않는다. 슬롯 전체 전달은 별도 검증 경로이며 Pointer escape를 보존한다. 임의 예외 metadata/문자열을 노출하지 않는다. 이 helper 재사용을 core 전체의 같은 실행 엔진 완료로 확대하지 않는다.

[동적 위치 인벤토리](dynamic-locations.json)는 node.inputs·when·repeat.items·repeat.key·on.inputs·emit.payload·State.initial **7개 위치의 양성/음성 61개 검사**를 대응한다. 문자열 함수가 반환 타입에 맞는 5개 위치에서는 concat/formatString을 각각 확인하고 when/repeat.items에서는 정상 문자열 반환도 소비 타입 오류로 거절한다. 각 위치에서 혼합 문법·잘못된 Pointer·owner/secrets/auth 루트를 확인한다.

State.initial은 새 owner의 명시 ports와 자신의 State 의존성만 읽는다. 이름별 맵의 선언 키 순서를 요구하지 않고 의존 그래프의 위상 순서로 초기화한다. 일반 @path·formatString의 선언 순서 반전과 동적으로 읽은 template 안의 추가 State 의존도 확인했다. 부모 상태를 암묵 캡처하지 않고, 초기값 생략은 missing, null은 실제 값이며 초기 순환/없는 State를 거절한다. inputs 변경으로 재초기화하지 않고 제거·재생성 때 새로 초기화한다. 포트 default는 literal이며 반환된 예약 키 데이터를 재실행하지 않는다. 이 부분은 동기 초기값 fixture이며 비동기 초기화·pending/error 처리는 기존 StateProbe의 별도 책임이다.

[action-bridge.mjs](action-bridge.mjs)는 A14만을 위한 private snapshot hook이다. 실제 ActionProbe의 owner/connect/snapshot으로 idle을 먼저 만들고 UI 입력에 전달한다. 같은 노드의 inputs/on 필드 순서와 형제 순서 4조합, 별도 owner의 같은 관찰 ID, `/actions/id/data`의 명시 입력, 실제 DOM의 idle→running→success를 확인했다. 무조건 존재하며 반복하지 않고 호출 대상이 바뀌지 않는 이름 있는 연결만 지원한다. 구조 조건/반복/슬롯 투영·호출 대상 교체의 Action 수명 통합은 이 bridge가 보장하지 않는다. native context나 K05 하위 호출 API를 추가하지 않았다. K01은 여기서 Component ref/inline의 입력·초기화·XOR·문맥만 검사하며 Query/Derived의 별도 증거를 대신하지 않는다.

UI 변경 뒤 기존 application 스크립트도 Node 22/24 **29/29**, Chromium **DOM 3/3+pageerror 1/1** 재실행했다. [hash 영향 기록](dependency-impact.json)은 변경된 application 결과와 별도로 갱신해야 하는 외부 coverage metadata를 구분한다. application 소스는 수정하지 않았다.

남은 범위는 실제 StateStore의 State/Query port 연결·소비/폐기, 실제 UI Query scheduler와 네트워크, 일반 UI Action 연결의 구조적 수명/취소 통합, 추가 함수 등록·완전한 리소스 스키마/입력 계약, Svelte 렌더러, 다른 브라우저, 포커스·스크롤·접근성 상호작용이다. Query 검사는 시작 spy이며 실제 Query 완료나 취소 검증이 아니다. 외부 상태 보존은 서비스 소유 fixture를 유지하는 모형 수준이다. DOM 어댑터는 매번 DOM을 다시 만들므로 core 상태 보존이 native DOM 정체성·포커스 보존을 뜻하지 않는다. fixture의 CSS 크기는 픽셀 배치 관찰용이며 제품 디자인 시스템의 확정 수치가 아니다.
