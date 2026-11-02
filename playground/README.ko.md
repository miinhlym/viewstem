# Viewstem core playground

[English](README.md) | 한국어

바닐라 JS로 JSON을 편집·실행하고 화면과 State·Query·Action 상태를 관찰하는 로컬 개발 도구다. 실제 `@viewstem/core`의 공개 진입점을 사용하며 별도 상태·Query 엔진을 만들지 않는다. DOM 컴포넌트와 HTTP 예제는 이 폴더의 호스트 코드다.

## 실행

저장소 루트에서 Node 22 이상과 기존 lockfile을 사용한다.

```sh
npm ci --ignore-scripts
npm run playground
```

기본 주소는 `http://127.0.0.1:4173`이다. 다른 포트는 `PORT=4174 npm run playground`로 지정한다. core를 빌드한 뒤 브라우저 bundle을 메모리에서 만들며 소스 파일을 바꿨다면 서버를 다시 시작한다. JSON 편집에는 재시작이 필요 없다. 종료는 Ctrl+C다.

## 사용 흐름

1. **Query와 Action**, **State와 Derived**, **Component와 반복** 중 예제를 불러온다. 처음 방문하면 첫 예제가 실행된다.
2. JSON을 수정하고 **실행** 또는 Cmd/Ctrl+Enter를 누른다. 매번 새 Registry·runtime으로 실행하여 State·Query를 초기화한다. 파싱·등록·mount 검증 실패 시 마지막 정상 실행을 유지한다. 적용 후 개별 Query 오류는 구성 실패와 구별해 Query 패널에 표시한다.
3. 미리보기의 입력·버튼을 조작한다. State 변화, Query의 running/success/error·stale·마지막 결과, Action의 running/success/error·실제 반환값을 관찰한다.
4. **중지**는 활성 요청·실행·구독을 정리한다. 이전 세대의 늦은 결과가 새 화면에 반영되지 않는다.

화면 전체를 편집기와 미리보기·상태 도구로 사용한다. 세로·가로 분할선을 드래그하거나 포커스 후 방향키로 크기를 조절한다. 두 번 클릭하면 기본 비율로 돌아간다. 상태 도구는 **State / Query / Action / Snapshot / Log** 탭으로 전환하며 방향키·Home·End도 사용할 수 있다. 좁은 화면에서는 **JSON / 미리보기 / 상태** 중 한 영역을 전체 높이로 표시한다.

초안은 현재 origin의 localStorage에 저장한다. 새로고침하면 초안만 복원하고 자동 실행하지 않는다. 저장 공간이 막혀도 편집·실행은 가능하다. **가져오기**는 초안을 바꾸며 실행은 별도다. **내보내기**는 아직 유효하지 않은 JSON까지 현재 편집 내용을 그대로 저장한다. JSON 입력 한도는 UTF-8 1MB다.

파일을 읽는 동안 더 최근의 편집·예제 불러오기·파일 선택이 발생하면 이전 파일 결과를 적용하지 않는다. Query·Action 오류 배너는 해당 Query가 복구되거나 같은 이벤트 연결을 성공적으로 재실행하면 사라지고, 실패 기록은 Log에 남는다. 미리보기 표시 오류가 발생하면 실행 상태에도 오류를 표시한다.

## JSON 입력

```json
{
  "resources": [],
  "view": {
    "states": {
      "message": { "kind": "State", "schema": { "type": "string" }, "initial": "Hello Viewstem" }
    },
    "render": {
      "id": "message",
      "componentRef": "Text",
      "inputs": { "text": { "@path": "/states/message" } }
    }
  },
  "inputs": {}
}
```

`resources`와 `inputs`는 생략할 수 있다. `view` 대신 `resources`에 등록한 View의 `viewRef`를 지정할 수 있으며 둘을 함께 지정하지 않는다. 이 외 리소스·표현식·스키마 문법은 [core 계약](../docs/VIEWSTEM-SPEC.md) 그대로다. JSON에서 실행할 JS 함수를 정의하는 별도 문법은 제공하지 않는다.

## 미리보기 컴포넌트

플레이그라운드가 아래 계약을 명시 등록한다. 같은 ID로 중복 등록하면 core가 거절한다. 정확한 기본값·스키마는 [components.mjs](components.mjs)와 화면의 **도움말**에서 확인할 수 있다.

| Component | inputs | slots / events |
|---|---|---|
| Stack | gap | default slot, 세로 배치 |
| Row | gap | default slot, 가로 배치·줄바꿈 |
| Card | title | header·default·footer slots |
| Text | text, tone: normal/muted/title | 텍스트만 표시 |
| TextInput | value, label, placeholder | change: string |
| NumberInput | value, label | change: number; 편집 중 빈 값·미완성 숫자는 전송하지 않으며 포커스를 옮기면 현재 State 값으로 표시 복원 |
| Checkbox | value, label | change: boolean |
| Button | label, disabled | click: 빈 객체 |
| Json | value, label | 구조화된 값 표시 |

JSON으로 선언형 Component를 추가하고 이 컴포넌트들을 조합할 수 있다. core가 확장한 `when`·`repeat`·slot과 노드 주소·세대를 따라 DOM을 유지한다. 새로운 코드형 화면 요소는 이 호스트의 등록 계약과 DOM adapter를 함께 추가한다. 범용 DOM/Svelte 렌더러 패키지, Grid·차트 UI를 제공하는 것은 아니다.

텍스트 입력의 IME 조합 중에는 Query 등의 snapshot 갱신이 입력값을 덮어쓰지 않는다. 조합 확정값은 한 번만 change 이벤트로 전달하고, 값이 바뀌지 않은 조합 취소는 이벤트를 실행하지 않는다.

같은 key의 반복 항목을 재정렬할 때는 포커스가 있는 DOM 하위 트리를 분리하지 않고 형제들을 옮겨 입력과 IME 조합을 유지한다. 항목 제거·재추가는 core 계약대로 새 수명이다.

## 관찰 범위

- State 패널: `view.getSnapshot().states`의 **View 최상위 State·Derived**. missing/pending/error와 실제 null/false를 구분한다.
- Query 패널: View 최상위 Query의 상태·data·dataInputs·error·stale·waitingReason. 새로고침·오류 재시도는 실제 Query 핸들을 호출한다.
- Action 패널: View가 소유한 이벤트 연결의 관찰 ID. 예를 들어 `on.click: { "id": "saved", "actionRef": "save" }`에 지정한 ID가 대상이다. 모든 등록 Action의 전역 실행 목록은 아니다.
- Snapshot 탭: Component 입력·상태·하위 노드·이름별 slot·화면 진단. Component 내부 셀·Query·Action을 모두 열거하는 debugger는 이번 범위에 없다.
- Log 탭: 최근 100개 이벤트·Query/Action 상태 전이·실행 오류. JSON 표시 한도는 40,000자/깊이 20, 미리보기는 3,000개 노드이며 초과 시 한도 메시지를 표시한다. 잘린 snapshot은 완전한 JSON export가 아니라 화면용 진단이다.

## HTTP 예제와 외부 API

예제의 Datasource는 현재 로컬 서버 주소를 JSON에 명시한다. `/api/concepts`는 `search`로 검색하고 `delay=0..3000`으로 응답을 지연하며 `fail=true`로 HTTP 503을 반환한다. 실패 후 이전 Query 결과 보존과 취소를 실제 HTTP로 검증하기 위한 fixture다. 다른 포트에서 저장한 초안을 가져오면 Datasource 주소를 수정하거나 예제를 다시 불러온다.

일반 Datasource도 브라우저에서 직접 fetch하며 CORS 등 브라우저 제약을 따른다. 로컬 서버는 외부 API proxy·secret resolver·로그인 저장소를 제공하지 않는다. `text`나 JSON 값은 DOM의 textContent로 표시하며 HTML로 해석하지 않는다.

## 검증

```sh
npx playwright install chromium
npm run test:playground
```

[기본 브라우저 테스트](test/playground.test.mjs)와 [경계 시나리오](test/edge-cases.test.mjs)는 실제 패키지를 bundle해 자동으로 서버·Chromium을 시작하고 종료한다. [검증 결과](../docs/handoff/playground-verification-results.json), [인수 기록](../docs/handoff/playground-implementation-2026-11-02.md), [기능별 점검표](../docs/handoff/playground-audit-2026-11-02.md)에 실행 범위·환경·제한을 남긴다. Svelte·Dart/Flutter·선택 차트와 공개 배포는 별도 후속이다.
