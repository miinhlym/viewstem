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
- core·Svelte renderer·playground 브라우저 검증은 대표 Node 24의 UI shard 4에서 실행한다.
- UI 11개 브라우저 파일을 측정 시간에 따라 4개 작업으로 배정한다. 각 작업 안에서는 기존처럼 순차 실행한다.
- 전체 117개 테스트와 66개 family 기대값은 유지한다. 개별 동작 테스트에서는 View에서 참조하는 family 전체를 등록하며, full catalog·갤러리·tarball의 전체 묶음 등록 검사는 유지한다.
- reporter는 부분 결과와 전체 결과를 구별한다. 최종 gate가 모든 파일의 실행·중복·실패·skip·todo·소스 해시·리비전·환경 일치 및 전체 family 인수를 검증한다.
- `main` push·PR·수동 실행만 받고 같은 PR/브랜치의 과거 실행은 취소한다. action은 확인한 v6 커밋 SHA로 고정한다.
- 모든 기존 브라우저 launch가 기본 headless 모드이므로 설치에 `--only-shell`을 사용해 실행에 쓰지 않는 headed Chromium 다운로드를 생략한다. 실행하는 브라우저 종류는 바꾸지 않는다.
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
| [Chromium headless shell](https://playwright.dev/docs/browsers#chromium-headless-shell) | 기본 headless 실행에 필요한 브라우저만 설치한다. headed/channel 사용 여부를 먼저 확인했다. |
| [Svelte testing](https://svelte.dev/docs/svelte/testing) | 실제 컴포넌트/통합 검사와 소형 로직 검사의 구분. 실제 Chromium 검증을 DOM 모형으로 대체하지 않는다. |

## 측정과 정확성 결과

기존 성공 CI를 baseline으로 유지한다. 로컬 진단은 같은 audit harness·빌드·Button
fixture에서 새 context 3회로 등록·스크립트 주입·mount 시간을 분리했다. 전체 묶음
등록은 약 993~1,062ms, 참조 family 등록은 약 24~26ms였다. 로컬 개발 서버 부하와
초기화 시간 변동이 있어 원격 CI 향상 비율로 환산하지 않는다.

완료 기준은 기존 테스트 이름 집합 보존, 전체 브라우저 인수 통과, 누락·중복·실패·
서로 다른 소스의 보고서를 거부하는 회귀 검사, 두 Node의 tarball 소비자 통과다.
원격에서는 같은 실행 소스의 완료 기록을 반복 확인하고 각 job 및 전체 경로의
실행 시간·러너 합계를 비교한다. 실패 실행과 불리한 측정은 제외하지 않고 기록한다.

원본 로컬 자료는 `.git/ci-evidence/optimization/`에 두며, 원격 결과는 Actions
실행 링크와 `ui-shard-*`, `ui-browser-results` artifact로 보존한다.
첫 변경 후 [CI 41616443238](https://github.com/miinhlym/viewstem/actions/runs/41616443238)는
리비전 `5d05401`에서 **전체 243초**에 성공했다. 3-shard 구성으로 기본 목표를 충족했으며,
실행 경로에서 러너 배정 차이를 제외한 계산은 `max(101,185,180,207,204)+12=219초`,
전체 러너 시간 합은 889초였다. UI 117개·family 66개와 양쪽 Node 호환성 검사가 통과했다.

추가 목표를 위해 이 실행의 파일별 시간과 core/renderer/playground 57초를 함께
균형 배치해 4-shard로 조정했다. headless-only 설치와 함께 적용한
[CI 41617437850](https://github.com/miinhlym/viewstem/actions/runs/41617437850)는
리비전 `70ac51e`에서 **전체 208초(3분 28초)**에 성공했다. 두 조정 각각의 독립 개선
비율을 주장하지 않는다.

| 측정 | 기준 | 3-shard 구성 | 최종 4-shard 구성 |
|---|---:|---:|---:|
| workflow 생성부터 완료 기록까지 | 889초 | 243초 | 208초 |
| 작업 의존 경로의 실행 시간 | 885초 | 219초 | 201초 |
| 전체 job 실행 시간 합계 | 1,565초 | 889초 | 811초 |
| workflow 조정·배정 등 나머지 시간 | 4초 | 24초 | 7초 |

의존 경로는 병렬 선행 작업 중 최댓값에 최종 gate 시간을 더한다. 마지막 구성은
`max(71,86,166,118,169,188)+13=201초`다. 나머지 시간은 workflow 전체 시간과의
차이이며 순수 러너 대기 시간만을 측정한 값은 아니다. 실제 대기를 포함해도
**5분 목표 PASS**, **3분 추가 목표 미달**이다. 전체 러너 시간도 기준 대비 약 48% 줄었다.
소수의 실행 결과이므로 p95나 모든 실행의 5분 이내 완료를 보장하지 않는다.
npm cache·러너 부하를 고정하지 않았으며 각각의 변경에 대한 인과 효과는 분리하지 않았다.

최종 구성에서 두 Node 각각 core 1,080개, CI 도구 회귀 6개, 세 tarball 설치 소비자가
통과했다. core 인수 대응은 core 216개·선택 차트 8개 구분을 유지한다. 브라우저에서는
CEL 두 어댑터 각각 25개, core 7개, Svelte renderer 30개, playground 41개가 통과했다.
UI 117개 이름 집합은 변경 전과 정확히 같고, 66/66 family·필수 사례 68개가 검증됐다.
제품 `src`·의존성·공개 API 변경은 없다.

실행별 리비전·소스 해시·작업 시간·판정·생략한 비교는
[기계 판독 결과](ci-optimization-results.json)에 기록한다. 이 문서의 수치는 `70ac51e`
실행 시점의 스냅샷이다. 최종 문서 커밋에서도 동일 실행 소스의 CI를 재확인하되,
실행마다 결과 문서를 다시 커밋하는 순환은 만들지 않는다.

독립 리뷰에서 카탈로그 인수 입력인 `docs/handoff/shadcn-component-inventory.json`이
로컬 결과 해시에서 빠진 것을 수정했다. 같은 HEAD에서 이 입력만 바꿔도 과거 결과가
거절되는 회귀를 추가했으며, 관련 6개 검사가 Node 22·24에서 통과했다.

로컬 전체 실행은 Node 24.1.0에서 117/117 통과, 실패·cancel·skip·todo 0,
66/66 family 인수를 확인했다. 변경 전 보고서와 테스트 이름 집합이 정확히 일치한다.
소요 시간은 327.006초였으며 macOS 개발 환경 값으로 원격 CI 목표와 직접 비교하지 않는다.
보고서 gate 회귀는 처음 5개에서 인수 입력 해시 검사까지 6개로 늘렸으며
Node 22.21.1·24.1.0 모두 통과했다. `actionlint`,
변경 diff 공백 검사, CI 안내의 로컬 링크와 영문·한국어 코드 블록 대조도 통과했다.

## Branch preflight — 2026-11-04

검토 시작 시 `main`·`origin/main`·확인한 원격 tip은 모두
`b1d82953ee418def825499e8090c999249cb2d94`였고 작업 트리는 깨끗했다.
이미 반영된 이번 작업 전체가 요청 범위이므로 upstream과의 빈 diff 대신 개편 직전
`4aa473b7efced7c035ff6518c694ddc1be81fafd`부터의 6개 커밋·18개 파일을 비교했다.
workflow·package script 2개, 테스트 실행/보고/fixture 7개, 문서 9개를 모두 검토했다.
생성된 dist·type cache·실행 보고서는 소스 diff에서 제외하고 실행 증거로 사용했다.

### 검증 범위 대조

기존 npm 검증 명령을 실제 하위 명령까지 펼쳐 새 workflow와 대조했다.
26종 명령에 누락은 없으며, Chromium 설치의 `--only-shell` 변경은 모든 실제 launch가
기본 headless 모드인 것을 확인했다. matrix·반복 횟수와 테스트 항목 수는 구별한다.

| 경계 | 개편 전 | 개편 후·검토 결과 |
|---|---|---|
| core 테스트·타입·인수 연결 | Node 22·24 | 두 버전 유지; core 216개·선택 차트 8개 구분 유지 |
| 세 패키지 빌드·타입·tarball | Node 22·24, 중복 빌드 포함 | 두 버전 유지; 각 job에서 한 번 빌드하고 실제 설치 소비자 검사 |
| UI 생성 재현 | vendor·sonner·type cache·catalog·components·CSS·audit matrix | 명령과 순서 모두 유지; 생성 소스는 검사하고 임시 catalog만 재생성 |
| core/CEL·renderer·playground 브라우저 | Node 22·24에서 같은 Chromium 검사 | 대표 Node 24 한 번으로 축소; 개별 검사 명령·본문 유지 |
| UI 동작 검사 | 117개·11개 파일, 두 Node에서 각각 실행 | 117개·11개 파일을 Node 24의 4개 shard에 정확히 한 번 배정; 이름·본문 삭제 없음 |
| 개별 동작의 등록 환경 | 매번 전체 컴포넌트 등록 | 사용 family만 등록; 모든 66개 갤러리와 357개 JSON Component 전체 등록 tarball 검사는 유지 |
| 자동 실행 trigger | 모든 branch/tag push와 PR | `main` push·PR·수동 실행; PR 없는 다른 branch/tag push 자동 실행은 제외 |
| 보고서·CI 도구 | 전체 실행 reporter | shard/전체 구분·통합 gate·새 파일 누락·실패·중복·서로 다른 소스 거부 회귀 추가 |

따라서 **테스트 항목 누락은 없지만 실행 환경·등록 조합·trigger는 의도적으로 좁아졌다.**
Node 22에서 전체 브라우저 suite를 다시 실행한 것으로 보고하지 않는다. full-catalog
검사는 유지되지만 개별 동작마다 무관한 family가 함께 등록되는 조합까지 반복하지 않는다.
카탈로그 검사는 upstream 386개 export 중 JSON fixture 351개와 raw 조합 나머지에 대한
대응을 유지하며, 이것을 386개 모두 독립 JSON Component라는 의미로 확대하지 않는다.

### 확인한 결함과 수정

1. **Stage 전 소스 삭제의 false failure:** `git ls-files --cached`에 남은 삭제 파일을
   읽다가 `ENOENT`로 테스트 시작이 막혔다. 현재 작업 트리에서 없어진 파일만 해시에서
   제외하며, 다른 읽기 오류는 계속 실패한다. 삭제 전 보고서 거부와 stage 전후 동일
   해시를 임시 Git 저장소로 검증했다.
2. **정상 native suite의 false failure:** `describe` 완료 이벤트까지 개별 테스트에
   포함해 실제 테스트 수와 어긋났다. suite 결과를 별도로 보존·검증·병합한다.
   단순히 suite를 버리면 정리 hook 실패를 놓칠 수 있어, suite 개수·누락·실패도 검사한다.
   정상 중첩 그룹과 실패·skip·todo·AbortSignal 취소·suite 정리 실패를 실제 Node
   subprocess로 검증했다. Node 22는 미리 취소된 테스트를 failed, Node 24는 cancelled로
   집계하므로 양쪽 모두 비정상 종료·보고서 거부를 확인한다.

회귀 개발 중 parent `NODE_TEST_CONTEXT`의 상속과 미완료 Promise에 의존한 취소 fixture가
각각 nested runner 생략·Node 24 timeout을 일으켰다. 독립 runner 환경과 명시적 AbortSignal로
fixture를 수정했으며, 이 중간 실패도 원본에 보존했다. 제품 결함이나 성공 증거로 바꾸지 않는다.

### 재검증과 재사용

- Node 22.21.1·24.1.0의 CI 도구 회귀는 **각 14/14 통과**했다. 보고서 입력을 꾸민 검사와
  실제 native runner 검사를 함께 사용했다.
- UI reporter가 바뀌어 Node 24에서 `npm run build:svelte-ui` 후
  `npm run test -w @viewstem/svelte-ui`를 실행했다. **117/117, 66/66 family·필수 사례 68개
  통과**, 실패·취소·skip·todo 0이며 이전 테스트 이름 집합과 정확히 일치했다.
  현재 작업 트리의 소스 해시·scope·suite 개수로 보고서를 다시 검증했다. 로컬 소요 시간
  223.011초는 CI 성능 수치로 사용하지 않는다. 중간 실행은 reporter 수정 확정 전에
  시작해 의도적으로 중단했으며 통과로 계산하지 않는다.
- `actionlint`, 변경 JS 문법, diff 공백, CI 안내 링크·영문/한국어 코드 블록이 통과했다.
- 변경 없는 core·Svelte·playground 본문, 타입·생성 재현·tarball 검증은
  [동일 HEAD 성공 CI 41618717896](https://github.com/miinhlym/viewstem/actions/runs/41618717896)의
  증거를 재사용한다. 이 실행은 전체 207초, 의존 경로 201초였다. 새 reporter 회귀는 로컬
  재검증이며 이전 원격 CI가 현재 미커밋 수정을 실행한 것처럼 보고하지 않는다.

현재 작업은 preflight 범위에서만 수정하며 commit·push·새 원격 실행은 하지 않는다.
실제 GitHub workflow 취소/부분 재실행의 provider 동작은 새로 재현하지 않았고,
원격 status는 다음 반영 후 확인할 gate다. 테스트 내부 취소 실패 전파와 구별한다.
원본·명령 대조·회귀 로그와 worktree 인계 fingerprint는
`.git/ci-evidence/preflight-2026-11-04/`에 보존한다. Dirty 인계 증거는 immutable ready
판정으로 재사용할 수 없으며, 다음 lifecycle에서 commit 후 다시 계산해야 한다.
