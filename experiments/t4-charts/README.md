# T4 선택 차트 독립 실험

[X01–X08](../../docs/spec/11-optional-charts.md)의 현재 계약을 검증하는 **폐기 가능한 실험**이다. 작은 직접 Canvas renderer와 Apache ECharts 6.1.0의 실제 SVG renderer를 사용한다. Viewstem core·공개 SDK·Svelte Component 구현이 아니며 자동 등록·자동 엔진 선택 기능을 추가하지 않는다. 이 실험은 production 구현 완료를 뜻하지 않으며, 현재 구현 시작·커밋 범위는 [U36 인수인계](../../docs/handoff/implementation-start.md#새-채팅에서-시작할-때)를 따른다.

Node 22.21.1·24.19.0 각각 계약 검사 **139/139**, 실제 Chromium 151.0.7922.34에서는 각각 **동일 계약 139/139 + 실제 렌더링 33/33 + 브라우저 오류 검사 1/1**이다. 같은 검사를 환경 수만큼 별도 계약으로 합산하지 않는다. 결과·소스 SHA-256·결과 SHA-256·테스트별 대응은 [coverage.json](coverage.json), 실제 데이터·SVG 경로·Canvas 명령·픽셀 증거는 [Chromium 22](results/chromium22.json), [Chromium 24](results/chromium24.json)에 있다. [스크린샷](results/chromium22.png)은 실제 실행한 각 fixture를 표시한다. 마지막 여섯 State 연결 패널은 renderer 폐기 직전 실제 그림을 캡처해 표시한다. 각 JSON의 `ORACLE.mutation-detection`은 정렬·중복 제거·null→0·데이터 교체·숨은 엔진 변경의 5개 고의 결함을 탐지한다.

```sh
npm ci --prefix experiments/t4-charts --ignore-scripts --no-audit --no-fund
# 공통 esbuild / Playwright가 없다면 기존 각 실험의 lockfile로 먼저 준비한다.
node experiments/t4-charts/run.mjs node22.json
/opt/homebrew/opt/node@24/bin/node experiments/t4-charts/run.mjs node24.json
node experiments/t4-charts/browser-run.mjs chromium22.json
/opt/homebrew/opt/node@24/bin/node experiments/t4-charts/browser-run.mjs chromium24.json
node experiments/t4-charts/update-coverage.mjs
```

`package.json`은 private이고 ECharts **6.1.0**을 정확히 고정했다. 이 폴더의 lockfile은 zrender 6.1.0·tslib 2.3.0과 integrity를 보존한다. 설치는 이 폴더에서만 `--ignore-scripts`로 실행했다. 번들러는 기존 `../verification/node_modules/esbuild`, 브라우저는 기존 `../t2-url-races/node_modules/playwright`와 설치된 Chromium을 재사용한다. 임시 `.browser-build/`만 이 폴더에 만들며 runner가 JS bundle을 종료 시 제거한다. `update-coverage.mjs`는 실패·중복 테스트 ID·소스 해시 불일치·스크린샷 해시 불일치를 거절한다.

실험용 입력은 `{engine,kind,rows,option?,series?}`이며 각 행은 `{seriesId,x,y}`다. 이 필드명은 공개 Viewstem SDK 제안이 아니다. `LineChart`, `TimeSeries`, `BarChart`는 별도 종류·명시 등록 descriptor이고 TimeSeries fixture는 time 축만 받는다. TimeSeries의 미기술 정렬·집계·상호작용 정책을 추정하지 않았다. X01–X08은 모두 한정된 독립 실험 수준의 `verified-experiment`이며 제품 core의 적합성 판정과 구별한다.

[state-chart-probe.mjs](state-chart-probe.mjs)는 기존 [StateProbe](../t3-state/state-probe.mjs)와 [compilePorts](../t3-state/ports-probe.mjs)를 수정 없이 재사용한다. 명시 등록 Component descriptor는 공통 `rows:Value`·선택 `sharedData:State`에 같은 행 배열 schema를 선언하고 `option:Value`·`series:Value`를 받는다. 옵션/series의 기본 schema는 object이며 상세 속성은 기존 엔진별 재귀 validator가 추가 검사한다. events는 빈 객체로 명시하며 선택 이벤트나 새 State 정책을 정의하지 않는다. 서비스 소유 데이터 State의 `stateValue(handle)` 읽기만 Value로 전달하고, State 포트는 명시 연결할 때만 동일 셀 정체성을 공유한다. host가 관찰할 주소를 명시해 구독하며 자동 표현식 의존성 추적을 구현한 것으로 주장하지 않는다.

`X01.state.*`의 12개 검사는 세 차트·두 엔진에서 두 소비자의 같은 셀 공유, Store 쓰기와 State 포트 쓰기 후 재계산, 안정 ID/기본값/override, 원본·과거 snapshot 보호, 한 소비자 폐기 뒤 다른 소비자의 갱신, 모두 폐기한 뒤 외부 State 존속을 확인한다. 같은 현재 값이어도 다른 schema(integer Y 대 number Y)와 Derived 대상 연결을 거절하고, 잘못된 Value 데이터·생략한 필수 rows·미선언 입력·State handle 자체를 Value로 전달하는 입력도 그리기 전에 거절한다. `DOM.X01.state.*`의 여섯 검사는 실제 Store 쓰기가 null 자리의 숫자 4와 Canvas/SVG 픽셀로 전달되는지, renderer를 실제 폐기해도 외부 State를 다시 쓸 수 있는지 확인한다.

데이터의 `seriesId` 문자열에서 그룹을 만들고 각 그룹의 행 순서·중복 X를 그대로 보존한다. defaults는 각 series에 적용하고 ID override를 중첩 속성별 병합한다. 이 병합 방식과 미등장 ID의 override 보존은 실험 구현 선택이다. 재정렬·추가·제거·재추가 뒤 세 차트 모두 같은 ID의 스타일을 유지한다. 입력을 변경하거나 freeze하지 않고 runtime 소유 복사 데이터를 만든다. `option.series`, `series.data`, defaults/override 안의 `data` 및 ID/type 덮어쓰기는 거절한다.

모든 Y는 유한 number 또는 명시적 null이어야 한다. 0·-0·소수·음수·최대/최소 유한 double을 보존하며 문자열·비유한 수·필드 누락·undefined·boolean·객체는 오류다. LineChart의 value/time 축은 실제 경로의 정점 순서까지 확인했다. LineChart·TimeSeries의 null 연결/단절은 입력의 null·0을 보존한 채 gap 픽셀·0 끝점·null X의 가짜 0 부재·경로의 이동 구간 수로 확인했다. ECharts `getOption()`의 runtime 데이터도 원본 기대값과 비교한다.

다음 표가 **이 실험 모듈의 전체 지원 옵션**이다. ECharts 제품 전체의 기능표가 아니며, 표 밖 속성은 양쪽 모두 오류다. ECharts renderer 자체는 Canvas/SVG를 지원하지만 여기서 명칭 `canvas`는 ECharts와 별개로 작성한 작은 Canvas renderer를 뜻한다. ECharts의 Canvas backend는 이번에 실행하지 않았다.

| 설정 경로 | 작은 Canvas | ECharts SVG | 검증 범위 |
|---|---|---|---|
| `option.xAxis.type` | `value` / `time` | 동일 | LineChart 양 축 실제 경로, TimeSeries `time` 강제; X는 유한 numeric/epoch ms만 |
| `option.xAxis.min/max`, `option.yAxis.min/max` | 유한 number, min < max | 동일 | 실제 정점·gap 좌표. 전체 유한 범위 렌더링 안정성은 미검증 |
| `option.title.text` | 거절 | string | SVG 텍스트 실제 표시 |
| `option.grid.left/right/top/bottom` | 거절 | 유한 pixel number | 실제 plot 좌표와 native 옵션 비교 |
| `series.defaults` / `series.overrides[ID]` | 지원 | 지원 | 아래 속성만; 세 종류 live reorder·add/remove/re-add 검사 |
| 선의 `connectNulls` | boolean | boolean | LineChart/TimeSeries 모두 false/true 픽셀·경로 비교 |
| 선의 `lineStyle.color` | `#RRGGBB` | 동일 | 실제 stroke 색 및 ID override |
| 선의 `lineStyle.width` | 양의 유한 number | 동일 | Canvas 실제 stroke와 SVG stroke-width |
| 선의 `smooth` | 거절 | boolean | true의 실제 곡선 C 경로, false/생략의 순서 fixture |
| 선의 `showSymbol`, `symbolSize` | 거절 | boolean / 양의 유한 number | true의 3개 symbol·실제 10px 크기, false의 순수 선 fixture |
| 막대의 `itemStyle.color`, `barWidth` | `#RRGGBB` / 양의 유한 number | 동일 | 실제 빨간 막대·16px 폭, ID override |

선 속성은 LineChart/TimeSeries, 막대 속성은 BarChart에만 허용한다. `yAxis.type=value`, animation 비활성화, runtime series의 type/id/name/data는 실험 내부가 소유한다. 옵션의 중첩 알 수 없는 속성, 잘못된 bool·색·폭·축 범위, `dataset`, `xAxis.data`, transform·데이터/ID/type 주입을 부정 검사한다. Canvas에 ECharts 전용 title/grid/smooth/symbol 속성을 주면 오류이며 ECharts로 바뀌지 않는다. 임의 옵션을 native ECharts가 알아서 무시하게 맡기지 않는다. 이 제한을 ECharts의 광범위 옵션 활용 방향에 대한 최종 지원 목록으로 확정하지 않는다.

남은 범위는 제품 Component SDK·Svelte/core·Query/renderer 수명 통합과 자동 표현식 의존성 추적, category/string/date X·다른 축/차트·이벤트·반응형 resize·접근성·다른 브라우저·Canvas backend의 ECharts, 임의 옵션/조합과 큰 데이터다. 전체 유한 double은 입력/전달 검증만 했으며 브라우저 그림은 작은 값 fixture다. 모든 double의 수치·시각 안정성이나 사용자 정의 JavaScript Proxy/accessor 입력의 보안을 검증했다고 주장하지 않는다. null과 smooth의 조합·stacked/area·animation/streaming도 이번 증거 밖이다. 상태 없는 `simpleWidget({label})`는 series 구조를 요구하지 않는 독립 fixture이며 다른 실제 위젯들의 적합성 결과가 아니다.

라이브러리 사실은 2026-10-30 공식 자료에서 확인했다. [Apache 공식 릴리스](https://github.com/apache/echarts/releases/tag/6.1.0)와 npm registry가 6.1.0·같은 저장소를 가리킨다. [공식 npm/import 안내](https://echarts.apache.org/handbook/en/basics/import/)에 따라 필요한 Line/Bar, Grid/Title, SVG 모듈만 등록했다. [공식 Canvas/SVG 안내](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)는 backend 선택을 설명하고, [공식 line 옵션 문서](https://github.com/apache/echarts-doc/blob/master/en/option/series/line.md)는 `connectNulls`와 `showSymbol`을 설명한다. [6.1.0 데이터 변환 원본](https://github.com/apache/echarts/blob/6.1.0/src/data/helper/dataValueHelper.ts)은 native 입력 변환을 확인하는 참고이며, Viewstem 입력은 그 전에 엄격히 검증한다. 공식 문서 존재를 실제 시험 통과의 대체 증거로 쓰지 않는다.
