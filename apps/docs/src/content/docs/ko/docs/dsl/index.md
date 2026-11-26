---
title: DSL 레퍼런스
description: Viewstem 리소스의 필드, 값 문법, 실행 규칙을 찾아봅니다.
sidebar:
  order: 0
---

Viewstem JSON을 작성하거나 검토할 때 이 레퍼런스를 사용하세요. 각 페이지는 현재 core가 받는 필드와 기본값을 설명합니다. 독립 리소스에는 등록용 외피가 필요합니다. 인라인 정의에는 해당 필드가 요구하는 본문을 넣습니다.


이 레퍼런스는 현재 사이트가 사용하는 Core 계약을 설명합니다. 필드 설명과 구성별 실행 예제는 각 리소스 페이지에서 확인하세요. 별도의 기계 판독용 리소스 JSON Schema는 제공하지 않습니다. 등록 검증과 런타임 검사는 참조, 포트 연결, 표현식 및 실행 환경을 함께 확인합니다.

## 리소스별 JSON

각 링크에서 등록 외피를 포함한 최소 예제와 필드 설명을 확인하세요. State는 독립 리소스가 아니라 View 또는 Component 안에 선언합니다.

| 리소스 | 역할 |
| --- | --- |
| [View](/ko/docs/dsl/view-and-component/#독립-리소스-예제) | 실행할 화면 정의 |
| [Component](/ko/docs/dsl/view-and-component/#독립-리소스-예제) | 재사용할 화면 구성 |
| [Variable](/ko/docs/dsl/state-and-ports/#독립-리소스-예제) | CEL 계산 |
| [Query](/ko/docs/dsl/queries/#독립-리소스-예제) | 데이터 조회와 변환 |
| [Datasource](/ko/docs/dsl/datasources/#독립-리소스-예제) | 공통 HTTP 설정 |
| [Action](/ko/docs/dsl/actions/#독립-리소스-예제) | 실행 단계와 출력 |
| [Type](/ko/docs/dsl/types/#독립-리소스-예제) | 재사용할 값 타입 |

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
