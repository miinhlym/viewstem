---
title: 리소스와 타입
description: 재사용 리소스를 등록하고 공용 Type으로 값을 검증합니다.
---

**리소스**는 재사용을 위해 앱에 등록하는 이름 있는 정의입니다. 앞에서 사용한 Component 참조처럼 조회, 계산, 동작, 타입에도 같은 방식을 사용합니다. 리소스 정의와 화면 실행 중 만들어지는 인스턴스는 구분합니다.

## 리소스 종류 구분하기

| kind | 정의하는 내용 |
|---|---|
| `View` | 화면 실행 진입점과 구성 |
| `Component` | 재사용 UI 단위 |
| `Query` | 요청과 결과 변환 |
| `Datasource` | 연결 설정과 인증정보 참조 |
| `Variable` | 순수 CEL 계산 |
| `Action` | 명시적으로 호출하는 동작 |
| `Type` | 재사용 데이터 스키마 |

State와 Derived는 실행 중인 View나 Component 인스턴스에 속합니다. 독립 리소스 종류를 추가하는 것은 아닙니다.

## 공용 Type 등록하기

독립 리소스는 `kind`, `id`, `spec`을 갖습니다. 마운트 전에 아래 Type을 `renderer.runtime.registry.registerResources([definition])`으로 등록합니다.


```json
{
  "kind": "Type",
  "id": "project-status",
  "spec": {
    "schema": {
      "type": "string",
      "enum": [
        "Draft",
        "Saved"
      ]
    }
  }
}
```


`project-status`는 참조 ID입니다. 이 스키마는 **Draft**와 **Saved**만 허용합니다. 최상위의 선택적 `name`은 표시 이름이며 참조 키가 아닙니다.

## typeRef로 검증 규칙 재사용하기

아래 View는 두 입력에 같은 Type을 적용합니다. 마운트할 때 `inputs: { title: "Saved", next: "Draft" }`를 전달합니다.


```json
{
  "ports": {
    "title": {
      "kind": "Value",
      "typeRef": "project-status",
      "required": true
    },
    "next": {
      "kind": "Value",
      "typeRef": "project-status",
      "required": true
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/ports/title"
      }
    }
  }
}
```


배지에는 **Saved**가 표시됩니다. 어느 포트든 **Archived**를 전달하면 검증에 실패합니다. Type은 검증 규칙을 공유하며 입력값 공유, 자동 변환, UI Component 선택을 수행하지 않습니다.

타입 계약에는 `schema`와 `typeRef` 중 하나만 사용합니다. 포트의 `required`는 해당 입력의 필수 여부이고, JSON Schema 안의 `required` 배열은 객체 값에서 필수인 속성 이름을 지정합니다.

## 참조와 인라인 정의 선택하기

`componentRef`, `queryRef`, `variableRef`, `actionRef`, `datasourceRef`, `typeRef`는 각각 해당 종류의 리소스를 ID로 선택합니다. 등록 식별자는 `(kind, id)`이므로 Component와 Query는 같은 ID를 쓸 수 있지만 Component 두 개는 같은 ID를 쓸 수 없습니다.

한 번 사용하는 정의는 render 노드의 `component`나 Query 사용의 `query`처럼 지원하는 위치에 본문을 인라인으로 넣을 수 있습니다. 참조와 인라인 중 하나를 선택하며 둘을 함께 쓰지 않습니다. 인라인 정의도 필요한 입력을 명시적으로 선언합니다.

## 정의·인스턴스·저장 구분하기

기존 View는 적용할 때 받은 리소스 정의를 유지합니다. 등록소를 변경했다고 실행 중인 모든 인스턴스가 몰래 바뀌지는 않습니다. 앱이 변경된 정의를 명시적으로 적용하고 저장 시점도 정합니다. 실행 중 State 변경, View 구성 편집, 공용 리소스 수정, 데이터베이스 저장은 서로 다른 작업입니다.

[공용 Type 예제](../../../examples/shared-type/)에서 허용되는 값과 거절되는 값을 확인해 보세요.
