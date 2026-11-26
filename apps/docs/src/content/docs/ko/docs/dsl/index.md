---
title: DSL 레퍼런스
description: Viewstem 리소스의 필드, 값 문법, 실행 규칙을 찾아봅니다.
sidebar:
  order: 0
---

Viewstem JSON을 작성하거나 검토할 때 이 레퍼런스를 사용하세요. 각 페이지는 현재 core가 받는 필드와 기본값을 설명합니다. 독립 리소스에는 등록용 외피가 필요합니다. 인라인 정의에는 해당 필드가 요구하는 본문을 넣습니다.

## 리소스별 JSON

리소스별 전체 JSON Schema를 문서에서 펼치거나 내려받을 수 있습니다. 최소 등록 예제도 함께 제공됩니다. 스키마는 JSON 구조를 설명합니다. 참조, 포트 연결 및 실행은 Core에서 추가로 검증합니다. State는 View 또는 Component 안에 선언합니다.

| 리소스 | 전체 스키마 | 최소 예제 |
| --- | --- | --- |
| View | [JSON Schema](/ko/docs/dsl/view-and-component/#view-json-schema) | [예제 열기](/ko/docs/dsl/view-and-component/#독립-리소스-예제) |
| Component | [JSON Schema](/ko/docs/dsl/view-and-component/#component-json-schema) | [예제 열기](/ko/docs/dsl/view-and-component/#독립-리소스-예제) |
| Variable | [JSON Schema](/ko/docs/dsl/state-and-ports/#variable-json-schema) | [예제 열기](/ko/docs/dsl/state-and-ports/#독립-리소스-예제) |
| Query | [JSON Schema](/ko/docs/dsl/queries/#query-json-schema) | [예제 열기](/ko/docs/dsl/queries/#독립-리소스-예제) |
| Datasource | [JSON Schema](/ko/docs/dsl/datasources/#datasource-json-schema) | [예제 열기](/ko/docs/dsl/datasources/#독립-리소스-예제) |
| Action | [JSON Schema](/ko/docs/dsl/actions/#action-json-schema) | [예제 열기](/ko/docs/dsl/actions/#독립-리소스-예제) |
| Type | [JSON Schema](/ko/docs/dsl/types/#type-json-schema) | [예제 열기](/ko/docs/dsl/types/#독립-리소스-예제) |

| 찾아볼 항목 | 레퍼런스 |
| --- | --- |
| 리소스 종류, ID, 참조 필드 | [리소스](/ko/docs/dsl/resources/) |
| 리터럴, 경로, 함수 호출, 평가 문맥 | [값 표현식](/ko/docs/dsl/values/) |
| View와 Component 본문, 노드, 슬롯, 이벤트, 반복 | [View와 Component](/ko/docs/dsl/view-and-component/) |
| State, Derived, Variable, reaction, 입력 포트 | [State와 포트](/ko/docs/dsl/state-and-ports/) |
| Query 정의, 소스, 변환, 실행 주기 | [Query](/ko/docs/dsl/queries/) |
| HTTP 요청, 공통 설정, 비밀 참조, Login | [HTTP Datasource](/ko/docs/dsl/datasources/) |
| Action 정의, 단계, 출력, 이벤트 연결 | [Action](/ko/docs/dsl/actions/) |
| 스키마 키워드, Type 참조, 네이티브 값 | [Type과 스키마](/ko/docs/dsl/types/) |

첫 화면을 만들려면 [빠른 시작](/ko/docs/quickstart/)을 따라 하세요. 정의를 등록하고 화면을 실행하는 TypeScript 메서드는 [Core API](/ko/docs/core/)에서 확인할 수 있습니다.
