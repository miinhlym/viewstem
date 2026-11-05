---
title: 리소스
description: 일곱 가지 리소스 종류와 등록 외피, 참조 및 인라인 형식을 설명합니다.
sidebar:
  order: 1
---

## 리소스 외피

`Resource<K, S>`는 리소스 종류와 해당 종류의 본문을 연결합니다. `ResourceSpecs`는 종류별 본문 타입을 정의하고, `AnyResource`는 일곱 가지 독립 선언형 정의를 모두 포함하는 유니온입니다.

| 필드 | 계약 |
| --- | --- |
| `kind` | 필수. 아래 일곱 `ResourceKind` 이름 중 하나이며 대소문자를 구분합니다. |
| `id` | 비어 있지 않은 필수 문자열. 레지스트리는 `(kind, id)`로 정의를 식별합니다. |
| `name` | 선택적 표시용 문자열. 다른 정의와 중복되거나 나중에 바뀔 수 있습니다. |
| `spec` | 필수 객체. 허용 필드는 종류마다 다릅니다. |

외피에는 위 네 필드를 사용할 수 있습니다. 정의는 JSON 데이터이므로 함수, 접근자, 순환 구조, 빈 슬롯이 있는 배열, `undefined`, 네이티브 JS 컬렉션을 넣을 수 없습니다. 코드 구현은 JSON 계약과 함께 별도로 등록합니다. `RegisteredResource`는 등록한 코드형 Component 계약과 코드형 Action 정의도 포함합니다.

| 종류 | 본문 |
| --- | --- |
| `Datasource` | [DatasourceSpec](/ko/docs/dsl/datasources/) |
| `Query` | [QuerySpec](/ko/docs/dsl/queries/#queryspec) |
| `Variable` | [VariableSpec](/ko/docs/dsl/state-and-ports/#variablespec) |
| `Action` | [ActionSpec](/ko/docs/dsl/actions/#actionspec) |
| `Component` | [ComponentSpec](/ko/docs/dsl/view-and-component/#viewspec-and-componentspec) |
| `View` | [ViewSpec](/ko/docs/dsl/view-and-component/#viewspec-and-componentspec) |
| `Type` | [Type 본문](/ko/docs/dsl/types/#type-리소스) |

## 참조와 인라인 본문

각 행에서 두 형식 중 하나를 선택합니다. 참조는 해당 종류의 문자열 ID를 받습니다. 인라인 객체에는 정의 본문을 넣습니다. 노드의 `id`나 소스의 `request`처럼 사용 위치에 속하는 필드는 본문 바깥에 둡니다.

| 사용 위치 | 참조 | 인라인 필드 | 함께 쓰는 필드 |
| --- | --- | --- | --- |
| 호스트의 View 적용 대상 | `viewRef` | `view` | 호스트 `inputs`, 선택적 `url` 설정 |
| render 또는 슬롯 노드 | `componentRef` | `component` | `id`, `inputs`, `slots`, `on`, `when`, 허용 위치의 `repeat` |
| Query 사용 또는 중첩 Query 소스 | `queryRef` | `query` | `inputs`. 실행 설정은 Query 사용 항목에 둡니다. |
| HTTP 소스 | `datasourceRef` | `datasource` | 필수 `request` |
| Derived 선언 | `variableRef` | `variable` | `inputs`와 결과 타입 계약 |
| 이벤트의 Action 호출 | `actionRef` | `action` | `inputs`와 선택적 연결 `id` |
| Query, Variable, Action을 호출하는 Action 단계 | `queryRef`, `variableRef`, `actionRef` | `spec` | 단계 `kind`, `inputs`, 선택적 단계 `id` |
| 타입 계약 | `typeRef` | `schema` | 해당 계약을 사용하는 선언에 따라 달라집니다. |

다음 리소스를 한 번에 등록하면 뒤에 놓인 Type을 Action 검증에서 찾을 수 있습니다. 이 Action을 입력 없이 호출하면 문자열 `draft`가 반환됩니다.

```json title="resources.json"
[
  {
    "kind": "Action",
    "id": "status",
    "spec": {
      "steps": [],
      "output": { "typeRef": "status", "value": "draft" }
    }
  },
  {
    "kind": "Type",
    "id": "status",
    "name": "프로젝트 상태",
    "spec": { "schema": { "enum": ["draft", "saved"] } }
  }
]
```

## 등록과 인스턴스

의존하는 리소스는 먼저 등록하거나 같은 묶음에 넣습니다. 레지스트리는 중첩된 인라인 정의까지 함께 검증하고, 누락되거나 종류가 맞지 않는 참조, 같은 종류의 중복 ID, 정의 간 순환 포함과 호출을 거절합니다. 정의 등록 중에는 Query를 실행하지 않습니다. 호스트는 View 적용 시 리소스 조회 함수를 제공할 수 있습니다. [Registry](/ko/docs/core/registry/)와 [Runtime](/ko/docs/core/runtime/)을 참고하세요.

정의 ID는 재사용할 설정을, 노드 ID는 작성 범위의 선언을, 반복 키는 반복 선언에서 펼쳐진 각 인스턴스를 식별합니다. 같은 정의를 사용하는 여러 인스턴스는 각각 State와 Query 결과를 소유할 수 있습니다. 실행 중인 View는 적용 시점에 확보한 정의를 사용합니다. [리소스와 타입](/ko/docs/concepts/resources-and-types/)과 [노드 식별](/ko/docs/dsl/view-and-component/#노드-식별)을 참고하세요.
