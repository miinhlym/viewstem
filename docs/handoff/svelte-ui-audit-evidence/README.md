# 동작 감사 실행 증거

## 최종 통과 기록

- `node22-full.json`·`node22-full.log`: Node 22 전체 115개 통과.
- `node22-catalog.xml`·`node22-catalog.log`: 이후 한국어 검색 예제 수정과 추가 회귀 사례를 포함한 카탈로그 7개 통과. 앞선 실행과 중복을 제외하면 116개다.
- `node24-full.json`·`node24-full.log`: 최종 코드와 예제의 전체 116개 통과.

환경·해시·패키지 소비자 검사 결과는 [검증 결과](../svelte-ui-audit-verification-results.json)에 기록한다.

## 수정 전 재현 기록

`*-before.log`는 진단 중 실행한 원본 로그다. Avatar·Badge·DataTable·Carousel·Popover/Command·disabled 링크형 Button의 수정 전 실패를 보존한다. 같은 탐색 실행에는 잘못된 테스트 기대값도 포함되어 있으므로 모든 실패를 제품 결함으로 세지 않는다.

실행기가 출력한 빈 줄의 들여쓰기까지 원본대로 보존한다. 이 디렉터리의 `.gitattributes`는 해당 수정 전 로그에 한해 Git 공백 검사를 제외하며, 제품 코드와 일반 문서의 검사에는 영향을 주지 않는다.

- NativeSelect multiple은 DOM 문자열 이벤트 계약, Combobox는 fuzzy 검색, OTP는 마지막 글자 교체, Progress 완료 상태는 loaded다. 해당 기대값을 맞췄다.
- DataTable 최초 로그의 키보드 select 변경, Resizable의 동시 레이아웃 반영, MessageScroller 초기 자동 스크롤 대기는 테스트 동기화 문제다.
- 일부 종료된 브라우저 오류는 중단된 탐색 실행의 후속 실패다. 최종 제품 결함과 수정 범위는 [감사 인계](../svelte-ui-audit-2026-11-03.md), 재실행 결과는 [검증 결과](../svelte-ui-audit-verification-results.json)를 따른다.
