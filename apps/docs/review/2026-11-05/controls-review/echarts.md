# ECharts 선언형 설정 문서 분석

2026-11-05. 사용자 요청으로 공식 문서와 실제 브라우저 UI, 공식 문서 저장소를 조사했다. 옵션 편집 구현 전에 추가한 레퍼런스 분석이며 사이트 변경·새 메뉴 구조 확정을 뜻하지 않는다.

## 핵심 판단

선언형 설정 문서의 직접적인 레퍼런스로는 ECharts가 Storybook보다 가깝다. ECharts는 개념 학습, 설정 필드 조회, 호스트 API, 실행 예제를 나누면서 서로 연결한다. Viewstem에 적용할 핵심은 대형 옵션 폼 자체보다 **필드 설명 ↔ 조작 ↔ 선언 코드 ↔ 실행 결과**의 연결이다. 이는 조사에 따른 설계 판단이며 실제 독자 학습 효과의 실험 결과는 아니다.

## 확인한 구성

| 영역 | ECharts에서 확인한 내용 | Viewstem에 대한 시사점 |
|---|---|---|
| Handbook | 시작하기는 초기화부터 첫 차트까지 완전한 예제를 제공한다. Dataset 개념은 기존 방식, 한계, 대안, 코드와 실제 결과, 데이터 매핑 순서로 설명한다. | 핵심 개념·작업 가이드는 유지한다. 필드 목록만으로 State·Action의 관계를 설명하지 않는다. |
| Option | 좌측이 설정 객체의 계층을 표현한다. series → bar → label 같은 경로로 탐색하며 각 필드에 타입·기본값·설명·조건·관련 필드·직접 링크가 있다. | 컴포넌트 메뉴는 유지하되 상세 페이지에서 inputs·slots·on 및 State의 위치를 명확히 한다. 필드 링크는 실제 설명으로 연결한다. |
| Try It | 지원 필드 설명 옆에서 조작을 시작하고 공유 Preview에 코드와 차트를 함께 표시한다. | 주요 옵션은 무엇을 변경하는지 알려 주고 해당 레퍼런스와 연결한다. 페이지마다 수십 개 실행 영역을 만들 필요가 없다. |
| API | Option과 별도 진입점으로 초기화·인스턴스 메서드·이벤트 등 호스트 사용 계약을 제공한다. | View JSON/DSL과 createRenderer·mount·registerComponents의 문서를 구별한다. |
| 예제 편집기 | Edit Code, Full Code, Option Preview를 구분한다. JS/TS, Run, 실제 차트, 전체 초기화 코드, 옵션 트리에서 레퍼런스로 이동하는 링크가 있다. | 문서에서는 주요 옵션 실험, Playground에서는 자유로운 JSON 작성·실행을 담당하되 코드에서 계약으로 돌아오는 길을 만든다. |

출처: [시작하기](https://echarts.apache.org/handbook/en/get-started/), [Dataset 개념](https://echarts.apache.org/handbook/en/concepts/dataset/), [Option](https://echarts.apache.org/en/option.html#series-bar), [API](https://echarts.apache.org/en/api.html), [기본 막대 예제 편집기](https://echarts.apache.org/examples/en/editor.html?c=bar-simple).

## 직접 조작한 사례

브라우저에서 series-bar.colorBy의 Try It을 열었다. 기본 예제는 Bar on Cartesian이며 코드와 차트가 함께 나타났다. 선택값을 series에서 data로 바꾸자 코드에 colorBy: "data"가 추가되고 막대가 데이터 항목별 색상으로 바뀌는 것을 확인했다. 필드 제목에 적힌 기본값 'series'와 사용자가 고른 값 'data'는 별도로 표시되었다.

예제 편집기의 Full Code는 import, DOM 대상, echarts.init, option, setOption을 포함했다. Option Preview에는 편집 코드에 쓰지 않은 기본 설정도 표시되었고, 각 옵션에서 관련 레퍼런스로 이동하는 링크가 있었다. 따라서 이것을 단순히 ‘작성한 JSON 원문’이라고 설명하면 부정확하다. 내부적으로 어떤 API를 호출해 트리를 만드는지는 이번 조사에서 추적하지 않았다.

## 문서 구현 방식에서 가져올 점

공식 echarts-doc README는 공통 기본 예제 ExampleBaseOption과 필드별 ExampleUIControlBoolean/Number/Color/Enum/Text 등을 명시한다. 컨트롤은 현재 열린 예제를 사용한다. 제목 구조에 타입과 기본값을 적고 공통 설명은 partial로 공유한다. 별도 예제 iframe도 지원하되 성능 때문에 남용하지 않도록 안내한다. 즉, **공유 예제 + 작성자가 지정한 필드 컨트롤 + 구조화된 설명**이다. [공식 문서 소스 안내](https://github.com/apache/echarts-doc#document-embedded-examples)

Viewstem도 실제 공개 계약을 기준으로 한 예제 정의를 유지하고, 그중 교육적으로 의미 있는 필드의 편집 방법을 별도로 지정하는 것이 적합하다. 레퍼런스와 편집기의 타입·허용 값이 어긋나지 않도록 검증하되 모든 필드를 편집기로 생성할 필요는 없다.

## 그대로 옮기면 안 되는 차이

- ECharts option은 순수 JSON만을 뜻하지 않는다. formatter 등은 JavaScript 함수를 허용한다. Viewstem의 JSON 문서에서는 표현식·참조와 호스트에서 등록한 함수를 구별해야 한다. [formatter 계약](https://echarts.apache.org/en/option.html#series-bar.label.formatter)
- ECharts는 setOption으로 데이터·설정을 갱신하는 흐름을 문서화한다. 현재 Viewstem 문서 데모의 mount/dispose를 ECharts와 동일한 병합 갱신 API처럼 설명하면 안 된다. 옵션 변경 시 실행 상태 초기화 정책은 별도로 명시해야 한다. [동적 데이터 가이드](https://echarts.apache.org/handbook/en/how-to/data/dynamic-data/)
- ECharts의 고밀도 트리·미리보기 배치를 모바일 문서에 그대로 복제할 근거는 없다. 이번 조사는 데스크톱 대표 흐름이며 ECharts의 모바일·접근성·테마 전체 감사는 하지 않았다.
- 예제와 문서 사이의 깊은 링크는 도움이 되지만, 설명을 관련 링크 나열로 대체하지 않는다. 본문은 용도·조건·실제 결과를 자체적으로 설명해야 한다.

## 기존 옵션 편집안에 반영할 기준

1. 페이지 위쪽에서 실제 UI와 주요 옵션을 함께 다룬다. 옵션 이름에는 대상 JSON 필드와 레퍼런스 연결을 제공한다.
2. 주요 옵션 변경 시 같은 선언에서 코드·복사본·미리보기를 갱신한다. 변경된 필드를 찾기 쉽게 한다.
3. 작성한 View JSON과 실행 중 State를 섞지 않는다. ‘현재 설정 다시 실행’과 ‘기본 예제로 되돌리기’를 구별한다.
4. 상세 레퍼런스는 필드 경로, 타입, 기본값/필수 여부, 의미, 사용 조건, 작은 예제 순서로 설명한다. 중첩 구조는 계층을 보존한다.
5. 전체 JSON 직접 편집은 Playground 역할을 유지한다. 수정된 JSON 전달과 필드별 Try It 링크 확장은 별도 구현 범위로 구분한다.

추가 메뉴 전면 개편이나 전체 필드 Try It 도입은 이번 분석만으로 확정하지 않았다. 기존 주요 옵션 편집 구현 요청은 남아 있으며 이 조사 시점에는 제품 파일을 수정하지 않았다.

## 후속 구현

위 내용은 구현 전 조사·검토 기록이다. 이후 사용자 요청으로 주요 옵션 편집을 적용했으며 최종 범위와 실행 결과는 [구현·검증 기록](implementation.md)에 정리했다.
