# CI 실행 시간 개편 — 2026-11-03

## 목표와 기준

사용자 승인 범위는 전체 필수 검증 경로 **5분 이내**, 추가 목표 **3분 이내**다.
설치·빌드·테스트·인수 보고서 통합을 포함하고 GitHub 러너 배정 대기는 별도로
집계한다. 전체 러너 사용 시간도 함께 비교한다. 테스트 삭제·skip이나 검증되지 않은
결과 캐시로 목표를 맞추지 않는다. 제품 런타임 성능 개선을 주장하는 작업은 아니다.

기준 리비전은 `4aa473b7efced7c035ff6518c694ddc1be81fafd`이며
[성공 CI 41610602026](https://github.com/miinhlym/viewstem/actions/runs/41610602026)을
재사용한다. Node 22 작업 885초, Node 24 작업 680초이고, UI 브라우저 117개는 각각
704.275초·526.926초였다. 각 환경에서 66개 family 인수와 tarball 소비자가 통과했다.
이전 [41607958955](https://github.com/miinhlym/viewstem/actions/runs/41607958955)는
UI 테스트 통과 뒤 패키지 검사 경로 assertion이 실패한 증거로 남긴다.

## 채택한 구성

- Node 22.21.1·24.1.0에서 core 테스트·타입·인수 연결, 세 패키지 빌드·타입·생성 재현·tarball 설치를 유지한다.
- core·Svelte renderer·playground 브라우저 검증은 대표 Node 24에서 실행한다.
- UI 11개 브라우저 파일을 측정 시간에 따라 3개 작업으로 배정한다. 각 작업 안에서는 기존처럼 순차 실행한다.
- 전체 117개 테스트와 66개 family 기대값은 유지한다. 개별 동작 테스트에서는 View에서 참조하는 family 전체를 등록하며, full catalog·갤러리·tarball의 전체 묶음 등록 검사는 유지한다.
- reporter는 부분 결과와 전체 결과를 구별한다. 최종 gate가 모든 파일의 실행·중복·실패·skip·todo·소스 해시·리비전·환경 일치 및 전체 family 인수를 검증한다.
- `main` push·PR·수동 실행만 받고 같은 PR/브랜치의 과거 실행은 취소한다. action은 확인한 v6 커밋 SHA로 고정한다.
- 기존 로컬 전체 검증 명령은 유지한다. 새 사용법·필수 check 이름은 [CI 안내](../ci.ko.md)에 둔다.

Node 버전·의존성·공개 API·제품 구현은 변경하지 않는다. Node 26 추가 등 지원 정책
갱신은 이 실행 시간 개편과 분리한다. workflow timeout은 5분 성능 목표를 대체하지 않는다.

## 참고한 실제 구성

2026-11-03 공개 저장소의 성공 PR 실행·해당 리비전 workflow를 읽었다.
타 프로젝트의 테스트 수·기기·부하가 달라 속도를 직접 보장하는 근거로 쓰지는 않는다.

| 참고 | 반영과 경계 |
|---|---|
| [Bits UI](https://github.com/huntabyte/bits-ui/blob/19ea75c69303a0df3d1421c9fd30fa213422b695/.github/workflows/test.yml) | 대표 Node의 Chromium 검사와 별도 작업 분리. Vitest로 옮기는 작업은 필요하지 않아 하지 않는다. |
| [Svelte](https://github.com/sveltejs/svelte/blob/321d868ce9fe4d02c6b46e8d56a56d49674a6627/.github/workflows/ci.yml) | Node/OS 검증의 독립 작업, PR 과거 실행 취소. 이번 작업에서 OS 지원 행렬은 확대하지 않는다. |
| [Vite](https://github.com/vitejs/vite/blob/54431638c3a9fc6b38dbce8041051a3feca3c6e4/.github/workflows/ci.yml) | 호환성 matrix와 최종 gate 분리. README·라이선스도 실제 tarball에 들어가므로 문서 변경 전체 skip은 도입하지 않는다. |
| [Zod](https://github.com/colinhacks/zod/blob/15e25673bae8d407d52494fdb0e8741b7f1a1b0d/.github/workflows/test.yml) | 호환성 축별 검사 분리. TypeScript 버전 확대는 이번 범위에 넣지 않는다. |
| [Playwright CI](https://playwright.dev/docs/ci#workers) | 작업 내 제한된 동시성과 작업 간 분산, 결과 artifact 보존. 현재 native Node test runner를 유지한다. |
| [Svelte testing](https://svelte.dev/docs/svelte/testing) | 실제 컴포넌트/통합 검사와 소형 로직 검사의 구분. 실제 Chromium 검증을 DOM 모형으로 대체하지 않는다. |

## 측정과 정확성 계획

기존 성공 CI를 baseline으로 유지한다. 로컬 진단은 같은 audit harness·빌드·Button
fixture에서 새 context 3회로 등록·스크립트 주입·mount 시간을 분리했다. 전체 묶음
등록은 약 993~1,062ms, 참조 family 등록은 약 24~26ms였다. 로컬 개발 서버 부하와
초기화 시간 변동이 있어 원격 CI 향상 비율로 환산하지 않는다.

완료 기준은 기존 테스트 이름 집합 보존, 전체 브라우저 인수 통과, 누락·중복·실패·
서로 다른 소스의 보고서를 거부하는 회귀 검사, 두 Node의 tarball 소비자 통과다.
원격에서는 같은 실행 소스의 완료 기록을 반복 확보하고 각 job 및 전체 경로의
실행 시간·러너 합계를 비교한다. 실패 실행과 불리한 측정은 제외하지 않고 기록한다.

원본 로컬 자료는 `.git/ci-evidence/optimization/`에 두며, 원격 결과는 Actions
실행 링크와 `ui-shard-*`, `ui-browser-results` artifact로 보존한다.
현재 원격 변경 후 결과는 실행 대기 중이며, 목표 달성으로 판정하지 않는다.

로컬 전체 실행은 Node 24.1.0에서 117/117 통과, 실패·cancel·skip·todo 0,
66/66 family 인수를 확인했다. 변경 전 보고서와 테스트 이름 집합이 정확히 일치한다.
소요 시간은 327.006초였으며 macOS 개발 환경 값으로 원격 CI 목표와 직접 비교하지 않는다.
보고서 gate 회귀 5개는 Node 22.21.1·24.1.0 모두 통과했고 `actionlint`,
변경 diff 공백 검사, CI 안내의 로컬 링크와 영문·한국어 코드 블록 대조도 통과했다.
