# Component · View · slots · 레이아웃

기준일: 2026-10-28 · Viewstem v1 설계 계약

[명세 시작점](../VIEWSTEM-SPEC.md) · 이 문서는 최종 명세의 주제별 상세다. **확정**과 **구체화 필요/구현 제안/이전 승인 이관**을 구분해 읽는다. JSON은 계약 설명이며 실행 검증 완료를 뜻하지 않는다.

**예시 해석:** 아래 발전소·날씨·협력사 등의 명칭은 이전 논의의 설명용 예시다. `example.com` 계열 주소와 임의 ID만 사용하며 실제 회사 API·비밀값·기본 등록 리소스가 아니다. core는 이 도메인에 의존하지 않는다.

Query 사용 인스턴스는 [Query 상세](02-query.md)에 별도로 정리한다. 아래 Component 공개 slots/events 계약을 근거 없이 View의 공개 계약으로 자동 확대하지 않는다.

## 10.5 Component: 재사용 화면과 State/Derived

**확정:** Component는 재사용하는 UI 단위다. spec.ports·states·queries는 필요한 경우에만 두고, 선언형 구현은 단일 spec.render 루트로 구성한다. 공개 입력은 ports, 받는 UI 영역은 slots, 발행 가능한 이벤트는 events에 정의한다. 코드형 Component는 같은 공개 계약을 코드 등록 시 제공하고 실제 렌더러 구현은 별도로 연결한다. 아래는 기존 상태/Derived 예시에 render를 결합한 사례다.

```json
{
  "kind": "Component",
  "id": "plant-selector",
  "name": "발전소 선택",
  "spec": {
    "states": {
      "selectedPlantIds": {
        "kind": "State",
        "initial": [],
        "schema": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "selectedPlantCount": {
        "kind": "Derived",
        "inputs": {
          "plants": {
            "@path": "/states/selectedPlantIds"
          }
        },
        "variableRef": "count-selected-plants",
        "schema": {
          "type": "number"
        }
      }
    },
    "render": {
      "id": "summary",
      "componentRef": "ui.Text",
      "inputs": {
        "text": {
          "@path": "/states/selectedPlantCount"
        }
      }
    }
  }
}
```

쓰기 가능한 상태는 `selectedPlantIds`다. `selectedPlantCount`는 해당 배열을 입력받아 `count-selected-plants`로 다시 계산하며 직접 쓰기를 거절한다. 선택값의 외부 JSON 표현은 중복 없는 배열로 승인되었고 내부 Set 사용은 구현 선택이다. 아래 예시가 일반적인 Set 지원을 폐기하는 것은 아니다. 각 Component 실행 인스턴스는 자신의 상태값을 가진다. [E26] `ui.Text`는 number 입력을 표시할 수 있는 예시 코드 Component이며 서비스가 해당 계약과 구현을 등록해야 한다. core에 자동 설치되는 리소스가 아니다.

두 값은 같은 읽기 문법으로 연결한다. `@path`로 읽을 수 있다는 사실은 쓰기 권한을 뜻하지 않는다.

```json
{
  "@path": "/states/selectedPlantIds"
}
```

```json
{
  "@path": "/states/selectedPlantCount"
}
```

## 10.6 View: 화면 구성과 인스턴스

**확정:** View는 서비스가 마운트하는 화면의 진입점과 수명 소유자이며, 재사용 Component는 그 안에서 조합하는 단위다. View 역시 ports·states·queries를 소유할 수 있고 spec.render는 배열이 아닌 단일 루트 노드다. 자식 트리는 각 노드의 slots에 넣는다. 서로 다른 View 마운트는 별도 인스턴스이며 자동 전역 singleton이 아니다.

```json
{
  "kind": "View",
  "id": "plant-comparison",
  "name": "발전소 비교",
  "spec": {
    "render": {
      "id": "comparison",
      "componentRef": "ui.Row",
      "slots": {
        "default": [
          {
            "id": "left-selector",
            "componentRef": "plant-selector"
          },
          {
            "id": "right-selector",
            "componentRef": "plant-selector"
          }
        ]
      }
    }
  }
}
```

같은 plant-selector 정의를 두 번 참조하지만 left-selector와 right-selector는 상태와 Derived 결과가 분리된다. ui.Row는 default 슬롯의 내용을 가로 배치하는 등록 Component다. Row 자체가 새로운 상태 소유 범위를 만들지는 않는다. 공유할 값·셀·Query 사용 인스턴스는 공개 ports와 inputs로 명시적으로 연결한다.

### Component의 공개 계약과 슬롯

코드형과 선언형은 같은 componentRef로 조회한다. 같은 Component 종류 안의 같은 ID 중복 등록은 오류이며 코드형 우선 같은 숨은 fallback은 없다. 다른 종류의 Query 등이 같은 ID를 갖는 것은 허용하며 componentRef는 Component만 찾는다. [등록 식별 명확화](../VIEWSTEM-SPEC.md#41-정의와-인스턴스)의 U01을 따른다. ui./app. 접두사는 예시 이름일 뿐 구분 문법이 아니다. 입력 옵션은 inputs에 넣고 별도 props/options를 추가하지 않는다. 내부 값을 외부에서 바꾸려면 공개 ports로 연결해야 한다.

spec.slots는 body: {required:true}, footer: {}처럼 받는 영역을 선언한다. 사용 위치 slots는 이름별 **작성 순서를 유지하는 노드 배열** 또는 **전체 전달 슬롯 참조**를 받는다. {"@path":"/slots/body"}는 전달받은 UI 전체를 그 위치에 배치하며 배열 항목 삽입 문법은 아니다. children 별칭, 내장 Slot 노드, 동적 슬롯 이름, scoped slot 데이터는 1차에 두지 않는다. default도 해당 Component가 선언한 경우에만 존재한다.

required는 키 존재 여부다. 명시적 []는 유효하고 선택 슬롯 생략은 빈 내용이다. 여러 노드를 받으면 수신 Component의 실제 레이아웃 계약과 DOM/CSS가 배치한다. core가 암묵 Column을 삽입하거나 모든 슬롯을 한 자식으로 제한하지 않는다. 원하는 배치는 Row/Column/Grid를 명시한다. 슬롯에 전달된 노드는 **작성자 문맥**을 유지하며 받는 Component의 상태 문맥으로 재바인딩하지 않는다.

### 이벤트와 Action 연결

Component의 공개 events는 이벤트별 schema 또는 typeRef를 선언한다. 코드형은 등록 계약과 실제 코드가 함께 지원해야 하며 사용하는 JSON에서 이벤트 목록을 다시 선언하지 않는다. on의 이벤트별 핸들러는 actionRef(또는 인라인 action) + inputs, emit + payload 중 하나다. emit은 현재 작성 Component의 공개 이벤트 이름이다. 독립 리소스 참조가 아니므로 eventRef가 아니다.

이벤트 payload는 보통 데이터이며 DOM 이벤트나 State/Query 핸들이 아니다. payload 검증에 실패하면 Action을 호출하지 않는다. 핸들러 문맥의 /event를 inputs로 명시 전달하며 Action 내부에 /event를 암묵 제공하지 않는다. 자동 bubbling·전역 버스·Action 완료 이벤트는 추가하지 않는다. 요청 이벤트는 저장 완료를 뜻하지 않으며 외부 Action 실행 상태도 내부 버튼에 자동 전파하지 않는다.

Action을 호출하는 on 연결에는 실행 정보를 `/actions/id`로 읽기 위한 **선택적 로컬 id**를 붙일 수 있다. 이 id는 노드 id나 Action 정의의 actionRef와 역할이 다르다. 같은 View/Component 인스턴스의 호출 연결 조회 id끼리 중복되면 오류이며, 슬롯 내용을 여러 번 투영하여 같은 작성자 범위에 실제 중복 연결이 생기는 경우도 자동 공유하지 않고 거절한다. 서로 다른 Component 인스턴스의 내부 연결은 같은 로컬 id를 써도 독립적이다. id를 생략해도 연결별 실행 중 추가 호출 무시는 적용된다. 같은 Action 정의를 호출한다는 이유로 다른 연결의 실행 정보를 공유하지 않는다. 반복 투영의 연결마다 별도 조회 주소를 만드는 기능은 1차에서 보류한다. [E56]

실제 on 호출 연결을 제거하면 소유 View/Component가 살아 있어도 해당 실행·하위 Action의 후속 단계와 늦은 결과를 폐기한다. 같은 id로 재생성한 연결은 새 수명이다. [Action 수명 계약](../VIEWSTEM-SPEC.md#72-실행-관찰과-수명)을 따르며 단순 숨김·렌더러 분리와 구별한다. [E43]

### when과 repeat

when은 inputs 밖의 strict boolean 존재 조건이다. 생략은 항상 존재, false는 생성하지 않거나 기존 인스턴스를 폐기, 다시 true면 새 수명이다. false인 분기도 정적 구조·참조는 검증하지만 동적 입력 평가와 내부 Query 실행은 하지 않는다. 따라서 when:false로 존재하지 않는 componentRef나 잘못된 정적 구조를 숨길 수는 없다. 외부 소유 State는 유지한다. 복잡한 조건은 Variable/Derived로 계산한다.

repeat는 slots 배열의 노드에서 items·as·key로 선언한다. items는 반복할 배열, as는 현재 항목의 지역 이름, key는 항목의 안정적인 식별자다. 단일 render 루트에는 1차에서 허용하지 않는다. /repeat/별칭의 읽기 전용 항목 데이터를 inputs로 명시 전달한다. 안정적 데이터 key로 순서 변경 시 동일 인스턴스를 유지하며 누락·중복 key는 오류다. 제거 후 재추가는 새 수명이다. repeat 자체는 소유 범위를 만들지 않으므로 항목별 State·Query·Action은 재사용 Component 안에 둔다. 같은 범위에 중복되는 반복 on 조회 id도 위 규칙에 따라 오류다. [E56]

중첩 repeat에서는 서로 다른 별칭의 바깥 항목과 안쪽 항목을 함께 읽을 수 있다. 예를 들어 안쪽 템플릿은 `/repeat/plant/id`와 `/repeat/inverter/id`를 inputs에 함께 연결할 수 있다. 항목 key는 해당 반복 템플릿과 부모 항목 아래에서 구분하므로 전체 View의 모든 데이터 key가 전역 고유할 필요는 없다. 이 지역 값이 Component 내부에 자동 주입되는 것은 아니다. [E41]

**평가 순서 확정(U13):** 같은 노드에서는 repeat.items를 평가하고 항목별 as·key를 확정한 뒤 각 항목의 when을 평가한다. 그래야 when에서 현재 반복 항목을 사용할 수 있다. when:false이면 그 항목의 Component inputs·내부 Query·인스턴스는 만들지 않는다. repeat.items/key는 그보다 먼저 평가되는 구조 정보이며, 반복 전체를 막으려면 바깥 노드에 when을 둔다. 빈 items에서는 항목 when을 평가하지 않는다.

key는 string 또는 유한 number이며 두 종류를 구별하고 -0은 0으로 정규화한다. 전체 items의 누락·중복 key는 when으로 숨길 수 없다. 중첩 repeat의 as가 현재 보이는 바깥 별칭과 같으면 정적 오류이며, 형제 반복에서 같은 별칭을 사용하는 것은 허용한다. 읽기 전용 항목을 Component 포트에 넘길 때는 기존처럼 inputs를 명시한다. [U13]

### Grid 배치

Grid는 등록 Component이며 core 공통 CSS 문법이 아니다. Grid.inputs.layout은 직접 슬롯에 선언된 노드 또는 반복 템플릿 id를 키로 사용한다. componentRef나 런타임 반복 항목 ID가 아니다. 필수 GridItem 래퍼와 공통 node.layout은 두지 않는다.

12열 기준으로 row·column·rowSpan·columnSpan은 1부터 시작하는 양의 정수다. row와 column 모두 있으면 고정, 모두 없으면 자동, 하나만 있으면 오류다. 기본 span은 12×1이며 layout 항목 생략도 같다. 활성 고정 사각형을 먼저 예약하고 겹침·범위 초과를 오류로 처리한다. 자동 항목은 원래 노드/반복 확장 순서에 따라 앞으로만 행 우선 검색하며 전체 사각형의 빈 공간을 확인한다. dense 되채움이나 고정 항목 밀기는 없다.

반복 템플릿은 공통 span만 지정하며 항목별 고정 좌표는 1차 제외다. when:false는 공간을 차지하지 않지만 선언된 layout 키는 유효하다. 알 수 없는 선언 ID는 오류다. 슬롯 전달은 작성자와 ID 정보를 보존한다. 좌표 변경이 상태 정체성을 바꾸지 않는다. 읽기/접근성 순서는 원래 순서다. 행 높이·gap은 디자인 시스템 기준, 넘친 셀 내용은 내부 스크롤이며 자동 높이 증가·드래그 편집은 후속이다. 구체 픽셀 값은 정하지 않았다.
