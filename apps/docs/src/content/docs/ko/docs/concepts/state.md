---
title: State
description: View에 값을 보관하고 명시적인 쓰기로 변경합니다.
---

화면은 편집 중인 제목, 선택 항목, 설정의 활성 여부 등을 기억해야 합니다. **State**는 실행 중인 View나 Component에 이런 값을 보관합니다. State를 읽는 표현식에는 변경된 값이 반영됩니다.

## State 선언하고 읽기

아래 View는 제목을 **Draft**로 초기화합니다.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/states/title"
      }
    }
  }
}
```


`states`는 로컬 이름과 선언을 연결하는 맵입니다. `kind: "State"`는 쓰기 가능한 값을 만들고, `schema`는 타입을, `initial`은 초기값을 정합니다. 배지는 `/states/title`로 이 값을 읽습니다.

## 값 변경하기

이 View를 `mounted`로 마운트한 뒤 앱 코드는 State 핸들로 값을 변경할 수 있습니다.


```js
mounted.view.getState('title').write('Saved');
```


배지가 **Saved**로 바뀝니다. 새 값은 반영하기 전에 검증하므로 이 문자열 스키마에 숫자를 쓰면 실패합니다. 쓰기는 State 값 전체를 교체하며, 객체를 썼다고 기존 속성과 자동으로 병합하지 않습니다.

UI 이벤트에서도 Action의 `SetState` 단계로 같은 변경을 할 수 있습니다. Action은 State 포트로 변경 대상을 연결받아야 합니다. 이벤트와 Action의 연결은 이벤트와 Action 페이지에서 다룹니다.

## 초기값과 지속적인 연결 구분하기

`initial`에는 입력을 읽는 표현식을 넣을 수 있습니다. 초기화된 State는 명시적으로 쓰기 전까지 값을 유지합니다. 입력이 바뀔 때마다 초기값이 다시 덮어쓰지는 않습니다. 계산 결과를 계속 따라가야 한다면 Derived를 사용합니다.

준비된 초기값도 명시적 쓰기도 없다면 State는 값이 없는 상태입니다. 이는 의도적으로 넣은 `null`, 빈 문자열, 빈 배열과 다릅니다.

## State의 소유자와 수명

같은 Component를 두 번 사용하면 로컬 State도 각각 생성됩니다. 값을 공유하려면 부모가 소유한 하나의 State를 두 인스턴스의 State 포트에 연결합니다. 인스턴스를 제거하면 로컬 State의 수명도 끝나며, 다시 마운트하면 새 인스턴스가 생성됩니다.

State 변경은 실행 중인 값의 변경입니다. 데이터베이스에 저장하는 일은 앱이 담당합니다.

[State 예제](../../../examples/state/)에서 초기값과 표시 결과를 확인해 보세요.
