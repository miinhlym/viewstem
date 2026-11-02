# shadcn 66개 컴포넌트 동작 감사

## 범위와 완료 기준

사용자는 66개 컴포넌트별 검증표와 실제 입력·이벤트·State 전환·중첩·키보드 검사를 요청했다. 공개 패키지 `@viewstem/svelte`와 `@viewstem/svelte-ui`를 번들한 Chromium에서 실제 Core State/Action을 실행한다. 별도 UI 상태 모형은 사용하지 않는다.

- [동작 검증표](svelte-ui-audit-matrix.md)는 66개군 모두와 해당 없는 동작의 이유를 기록한다. [JSON 행렬](svelte-ui-audit-matrix.json)은 정확한 테스트 이름과 모든 부품의 공개 지원 참조를 제공한다.
- [지원표](../../packages/svelte-ui/src/lib/shadcn/support.json)의 386개 원본 부품은 JSON 351개와 native 문맥 전용 35개로 구분한다. 별도 recipe 6개를 더해 JSON 등록 ID는 357개다. 66개군 동작 통과와 386개 부품의 모든 props 조합 통과는 다른 주장이다.
- 기존 전체 mount, JSON 부품 참조, native Calendar/RangeCalendar/Chart 조합 검사를 유지한다. 새 동작 사례 68개, 공통 전송·속성 사례 2개, 한국어 갤러리 검색 사례 1개를 추가한다.
- 수정 후 전체 UI suite, 타입, 고정 원본 재생성 일치, 격리 tarball 소비자와 선택 import를 확인한다. 실제 실행 상태·환경·해시는 [결과 기록](svelte-ui-audit-verification-results.json)이 소유한다.

## 재현한 결함과 수정

| 결함 | 재현과 수정 | 회귀 근거 |
|---|---|---|
| 무관한 State 변경으로 팝업 내부가 다시 생성됨 | Bridge가 같은 값의 새 snapshot을 모든 prop/slot 의존성으로 전달해 Bits UI Portal watcher를 다시 실행했다. 속성별 반응 셀, 안정된 callback, 같은 JSON 입력의 decoded 값 재사용으로 실제 바뀐 속성만 전달한다. | 중첩 Popover 완료 callback·빠른 열기/닫기, 메뉴의 같은 DOM·포커스 보존, Command 검색·같은 입력·포커스 보존. 기존 IME/지연 입력/수명 검사를 재실행한다. |
| Avatar 이미지 교체 후 fallback 미표시 | 자동으로 loaded가 된 이미지의 src를 실패 URL로 바꾸면 Bits UI가 재검사를 건너뛰었다. 자동 로드 완료 후 source 변경 시 loading으로 전환해 검사한다. 명시 `loadingStatus="loaded"`의 preload 우회는 유지한다. | 정상→실패→정상 이미지, loading 상태 이벤트, 별도 강제 loaded 형제 |
| 독립 Badge의 스타일 누락 | AST 변환이 `svelte:element`에 CSS scope marker를 넣지 않았다. 동적 요소에도 marker를 붙인다. | 단독 outline Badge의 실제 1px 테두리, span→link 변경·Enter |
| Carousel 방향 State 변경 미반영 | 문맥이 최초 orientation/options/plugins를 캡처했다. getter로 현재 입력을 읽고 Embla reInit 시 이동 가능 상태와 snap 목록을 갱신한다. | 가로→세로 flex와 실제 Y축 이동, Next 키보드 활성화 |
| DataTable 데이터 축소 후 범위 밖 페이지 | 표시 모델을 마지막 유효 페이지로 제한한다. TanStack의 동일한 필터·정렬 모델을 사용하며 호스트 pageIndex·선택 State는 덮어쓰지 않는다. | 정렬/필터/페이지 크기/선택 후 뒤 페이지에서 데이터 교체, 실제 행·페이지 표기·이동 버튼·State 보존 |
| disabled 링크형 Button이 Action 실행 | anchor는 native button처럼 클릭을 억제하지 않는다. disabled anchor에서 기본 동작과 전파를 막고 consumer callback을 호출하지 않는다. | 실제 마우스 좌표 클릭으로 직접·상위 Action 미실행, enabled 링크의 정상 활성화 |
| Command 갤러리에서 한국어 표시명 검색 누락 | 영문 value를 사용한 예제에서 표시명 keywords를 누락했다. 원래 식별자를 유지하며 한국어 검색어를 추가한다. | 보고서·환경·도움말 검색, 빈 결과와 검색 해제, State 식별자·입력·포커스 유지 |

원본 shadcn archive와 기존 검증 기록은 보존했다. vendor 변경은 [고정 원본 변환](../../packages/svelte-ui/scripts/vendor-source.mjs)으로 재현하며 설치된 `node_modules`를 패치하지 않는다. core 및 Svelte renderer의 공개 API를 변경하지 않았다.

## 검증 방식과 한계

입력·이벤트 열은 실제로 사용하고 결과를 관찰한 값과 이벤트다. 공통 DOM 이벤트 40종은 직렬화 전송을 합성 dispatch로 검증한다. 이것을 실제 사용자 조작이나 해당 이벤트의 자연 발생 증거로 세지 않는다. 각 군의 테스트에서는 click, key press, 선택, 드래그, hover, 입력과 State write를 사용해 별도로 관찰한다. 표시 전용 부품은 직접 키보드 동작 대신 의미 있는 요소·레이아웃·중첩 자식 동작을 검증하고 해당 없음으로 표시한다.

모든 CSS 배치값·HTML 속성·locale·RTL·애니메이션 조합, 스크린리더, 실제 모바일 터치/Drawer swipe, WebKit/Firefox까지 검사한 것은 아니다. 개별 경계는 검증표 마지막 열에 남긴다. 35개 native 문맥 전용 부품은 기존 실제 조합 검사를 유지하며 JSON props/event 지원으로 확대하지 않는다. NativeSelect multiple의 change는 첫 선택 문자열이고, JSON 배열 왕복은 Select multiple의 valueChange를 사용한다.

## 재실행과 유지

```sh
npm run audit:matrix -w @viewstem/svelte-ui
npm run check:svelte-ui
```

`test/fixtures/audit-{controls,overlays,display}.json`이 동작 주장과 테스트 이름을 소유한다. `scripts/audit-matrix.mjs`가 이 파일과 공개 support manifest를 조합하며 카탈로그 누락·중복을 거절한다. `scripts/audit-reporter.mjs`는 실제 runner 결과에서 모든 필수 사례의 통과를 확인한다. `npm test`의 `test/results/current.json`은 로컬 산출물이며, 인계 시 아래 결과 기록에 환경·최종 해시·실행 증거를 함께 보존한다. 기존 CI의 `check:svelte-ui`에도 같은 검사가 포함된다.

## 후속 로컬 커밋 인계

감사 완료 뒤 사용자가 Svelte UI 구현·예제·수정·회귀 테스트·검증 문서의 분리 커밋을 요청했다. 아직 미커밋 상태였던 core 공개 API와 Svelte renderer가 UI 패키지의 선행 의존성이므로 함께 의도별로 분리했다.

| 커밋 | 범위 |
|---|---|
| `7ca586a` | core 공개 API·타입과 playground 소비자 정리 |
| `10d7dbe` | Derived State 의존성 갱신 수정과 회귀 검사 |
| `bce83eb` | Svelte renderer·타입·기본 예제·패키지 검사 |
| `16192b2` | shadcn 66개군 UI 패키지·고정 원본·빌드와 감사에서 수정한 구현 |
| `dd22e0c` | 편집 가능한 카탈로그·화면 예제·종류별 JSON·폼 State·한국어 검색 |
| `91ab9b0` | UI 회귀·패키지 소비자 검사와 66개 동작 검증표 |
| `6286b76` | Node 22/24 CI의 Svelte·UI 검사 |
| `558444d` | Svelte UI의 임시 패키징 캐시를 Git 대상에서 제외 |

문서 지도·공개 계약·사용법·인계·실행 증거는 별도 문서 커밋으로 보존한다. 분리 과정에서 제품 소스는 변경하지 않았으며, U45 결과의 소스 트리 6개와 기록된 산출물 8개의 SHA-256 일치를 확인했다. 동작 검증표 재생성 검사와 staged diff의 공백 검사도 통과했다. 기존 브라우저·빌드·타입·소비자 실행 증거를 재사용하며 새 전체 실행으로 표시하지 않는다.

이전 JSON의 `baselineCommit`과 커밋·발행 미실시 표기는 당시 검증 시점의 기록이다. 이번 후속 요청은 로컬 커밋만 승인했으며 원격 push나 패키지 발행은 실행하지 않았다.

이후 사용자 요청으로 진행한 전체 branch preflight의 발견·수정·기존 증거 재사용·검증 결과는 [별도 인계](svelte-ui-preflight-2026-11-03.md)를 따른다. 이 문서와 U45 결과 JSON은 해당 감사 시점의 증거로 유지한다.
