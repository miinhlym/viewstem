# 선택 차트 모듈 · 보존 계약과 인수 기준

기준일: 2026-10-29 · 이전 승인 의미의 공개 문서 복원

[명세 시작점](../VIEWSTEM-SPEC.md) · [이전 승인 이관](09-preserved-contracts.md) · [결정 근거](../history/evidence-index.md)

이 문서는 선택 UI 모듈로 제공할 차트의 승인 의미를 보존한다. 차트는 서비스가 코드 Component로 명시 등록하며 core의 기본 리소스가 아니다. 아래 계약을 보존한다는 사실은 모듈 구현·JSON Schema 검증·렌더링 테스트 완료를 뜻하지 않는다. 과거 위젯 명칭과 API는 현재 Component 계약에 맞춰 이관하며, 새 SDK 이름을 이 문서에서 확정하지 않는다.

## 차트 종류와 엔진 범위

**확정:** LineChart와 TimeSeries는 별도 차트 종류로 유지한다. 데이터·series 식별자·defaults/overrides·상태 연결의 공통 계약은 공유할 수 있지만, 두 종류를 이름만 다른 하나의 차트로 합치지 않는다. 선택 차트 모듈의 1차 계약이며 core의 필수 기본 차트 목록으로 확대하지 않는다. [E62]

ECharts 기반 구현은 ECharts option을 폭넓게 활용하는 방향이고, Canvas 기반 구현은 실제 구현한 범위만 지원한다. 동일 option을 두 구현이 모두 지원한다고 약속하지 않는다. 이 계약은 엔진 선택 기능이나 자동 전환을 제공하지 않는다. 지원하지 않는 option을 받았다는 이유로 Canvas에서 ECharts로 자동 전환하는 동작을 추가하지 않는다. 정확한 지원 option 목록과 어댑터는 각 모듈 구현에서 공개한다. [E62]

## LineChart의 입력 순서와 X 값

**확정:** 일반 LineChart는 time/value 축에서도 최종 입력 행 순서를 유지하고 중복 X 값을 허용한다. 렌더러가 X 값을 기준으로 암묵 정렬하거나 같은 X의 행을 제거하지 않는다. category 축의 기존 의미도 이 결정으로 변경하지 않는다. [E63]

정렬이 필요하면 차트에 전달하기 전에 명시적인 데이터 변환으로 수행한다. 과거의 `SortRows`는 이 역할을 설명한 이름이며 현행 Query 변환의 고정 API나 새 내장 kind를 확정하는 근거가 아니다. 이 LineChart 규칙을 TimeSeries의 미기술 세부까지 자동 확대하지 않는다.

## 동적 series와 옵션 소유권

**확정:** 동적 series를 사용하는 차트의 `option`은 차트 전체 옵션이다. series별 설정은 `series.defaults`와 `series.overrides`로 표현하며, overrides는 데이터에서 생성한 안정적인 series ID에 대응한다. 데이터 순서나 series 배열 위치를 식별자로 삼지 않는다. [E65]

- `series.defaults`는 동적으로 구성되는 series에 적용할 기본 설정이다.
- `series.overrides`는 해당 series ID의 설정을 지정한다. 재정렬·series 추가로 다른 series의 override가 적용되어서는 안 된다.
- `option.series`는 허용하지 않는다. 별도의 옵션 배열로 runtime이 구성한 series를 대체하지 않는다.
- `series.data`도 허용하지 않는다. 표시 데이터는 데이터 연결과 runtime이 소유하며 설정에 중복으로 넣지 않는다.

이 계약은 동적 series를 필요로 하는 차트에 적용하며 모든 위젯에 같은 series 설정 구조를 강제하지 않는다. defaults와 overrides의 정확한 검증 스키마·지원 속성은 각 구현에서 구체화하되 위 데이터 소유권과 안정 ID 의미를 유지한다. [E65]

## Y 값과 결측의 검증

**확정:** LineChart·BarChart·TimeSeries의 Y 값은 number 또는 명시적인 null이다. 숫자 문자열은 자동으로 숫자로 바꾸지 않으며, Y 필드 누락도 null 결측으로 바꾸지 않고 오류로 처리한다. [E66]

number의 허용 범위는 core의 [유한 숫자 계약](10-value-contracts.md#유한-숫자만-허용)을 따른다. [U08]

| 입력 예시 | 의미 |
|---|---|
| `{ "y": 12 }` | 숫자 데이터 |
| `{ "y": null }` | 명시적 결측 |
| `{ "y": "12" }` | 입력 오류 |
| `{}` | Y 필드가 필요한 행에서 입력 오류 |

위 `y`는 설명용 데이터 필드다. 실제 Y 필드 연결 API를 새로 정하는 예시가 아니다. 명시적 null을 0으로 바꾸지 않는다. 선의 null 구간을 연결하거나 끊어 표시하는 선택은 결측의 표현 방식이며, 숫자 문자열·필드 누락을 유효한 입력으로 바꾸는 규칙이 아니다. 정확한 표시 옵션 이름과 각 엔진의 지원 범위는 해당 모듈 계약에서 정한다. [E66]

## 모듈 등록과 지원표 검증

**구체화(U13):** 선택 차트는 공통 코드 Component 등록 계약을 사용하고 각 구현이 공개 inputs/schema·events·지원 option 목록을 제공한다. 등록한 engine의 계약 밖 옵션은 검증 오류로 드러내고 무시하거나 다른 engine으로 자동 전환하지 않는다. 같은 Component ID에 두 engine을 숨은 우선순위로 등록하지 않는다.

U34의 [독립 T4 실험](../../experiments/t4-charts/README.md)은 ECharts 6.1.0 SVG와 작은 Canvas renderer에서 명시한 옵션 프로필을 실제 실행했다. 지원 leaf 옵션·거절 사례·State 포트 연결·픽셀/경로 증거를 공개하며, 전체 ECharts 옵션이나 제품 모듈 구현의 완료를 뜻하지 않는다. X01–X08별 [실행 대응](../../experiments/t4-charts/coverage.json)을 따르고 core 최초 실행 가능 여부와 별도로 판단한다.

## 선택 모듈 인수 백로그

**상태: U34 독립 실험에서 X01–X08을 실행했다.** Node 22/24는 각각 139/139, Chromium은 각 173/173이며 모형과 실제 renderer의 범위는 위 T4 링크를 따른다. 실제 core/SDK/Svelte 모듈의 전체 적합성과 구별한다. 엔진별 지원 목록 밖의 옵션을 모두 구현하라는 요구가 아니다.

| ID | 입력/행동 | 기대 결과 | 근거 |
|---|---|---|---|
| X01 | LineChart와 TimeSeries 등록·사용 | 별도 차트 종류 유지, 공통 데이터·series·상태 연결 계약을 따름; core 자동 등록 없음 | E62 |
| X02 | Canvas 구현 범위 밖의 ECharts option 전달 | 지원 범위 밖임을 드러내며 지원했다고 표시하거나 다른 엔진으로 자동 전환하지 않음 | E62 |
| X03 | time/value 축 LineChart에 순서가 바뀐 X와 중복 X 전달 | 최종 입력 순서·중복 유지; 정렬은 명시적 upstream 변환에서만 수행 | E63 |
| X04 | 동적 series 재정렬·추가 후 ID별 overrides 적용 | 안정적인 데이터 생성 series ID를 따라 같은 series에 적용; 배열 위치로 다른 series에 이동하지 않음 | E65 |
| X05 | 차트 설정에 option.series 또는 series.data 제공 | 설정 오류; runtime 소유 series·데이터를 옵션으로 덮지 못함 | E65 |
| X06 | 세 차트에 유한·비유한 number·숫자 문자열·Y 필드 누락 전달 | 유한한 number 허용, 비유한 숫자·숫자 문자열·필드 누락 오류; 암묵 coercion·null 보충 없음 | E66, U08 |
| X07 | 명시적 null과 0을 포함한 선 데이터, 결측 연결/단절 표시 | null과 0 구별; 연결/단절 선택이 null 데이터를 0으로 바꾸거나 입력 오류를 숨기지 않음 | E66 |
| X08 | 동적 series가 필요한 차트와 필요 없는 위젯 구성 | 전자는 전체 option과 defaults/ID overrides 계약 적용, 후자에 동일 구조를 일괄 강제하지 않음 | E65 |
