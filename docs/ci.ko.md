# 지속적 통합

[English](ci.md) | 한국어

[core 워크플로](../.github/workflows/core.yml)는 `main` push, PR, 수동 실행에서
동작합니다. 같은 PR이나 브랜치의 새 실행은 이전 실행을 취소합니다.
필수 검사는 모든 호환성 작업과 브라우저 shard 및 통합 인수 검증에 의존하는
**CI complete**를 사용합니다.

## 검사와 환경

| 작업 | 환경 | 검사 |
|---|---|---|
| Node compatibility | Node 22.21.1·24.1.0, Ubuntu | 세 패키지 빌드, core 테스트·타입·인수 대응, CI 도구 회귀, Svelte/UI 타입, 생성 소스 재현, 세 tarball 설치 소비자 |
| Browser integration | Node 24.1.0 호환성 작업 안에서 실행 | core 브라우저 동작, Svelte renderer, 바닐라 playground |
| UI browser | Node 24.1.0, Chromium, Ubuntu 작업 3개 | 모든 UI 브라우저 파일; 사례별 독립 context/page와 shard 안의 파일 순차 실행 |
| CI complete | Node 24.1.0, Ubuntu | 선행 작업 전체 성공; shard의 소스·리비전·환경 일치; 누락 파일·중복 사례·실패·skip·todo 없음; 66개 family 계약 전체 검증 |

브라우저 동작은 shard 전체에서 한 번씩 실행하며, Node별 빌드·패키지 설치는
두 버전에서 검사합니다. 테스트 배치를 변경하며 공개 API나 컴포넌트 지원 동작은
바뀌지 않습니다. 테스트는 빌드한 공개 패키지 export를 사용합니다.
카탈로그·갤러리·tarball 검사는 전체 컴포넌트를 등록하고, 개별 동작 검사는 View에서
참조하는 컴포넌트의 family 전체를 등록합니다.

## 로컬 검사와 shard 관리

`npm run check:svelte-ui` 등 기존 명령은 계속 전체 로컬 검증을 실행합니다.
CI의 브라우저 분산을 재현하려면 다음을 실행합니다.

```sh
npm run build:svelte-ui
npx playwright install chromium
npm run test:ci
npm run test -w @viewstem/svelte-ui -- --shard=1/3
npm run test -w @viewstem/svelte-ui -- --shard=2/3
npm run test -w @viewstem/svelte-ui -- --shard=3/3
node packages/svelte-ui/scripts/merge-test-reports.mjs packages/svelte-ui/test/results
```

[브라우저 계획](../packages/svelte-ui/scripts/browser-plan.json)은 모든
`*.browser.mjs` 파일을 정확히 한 번 배정합니다. 파일을 추가하면 계획에도 넣어야
하며 미배정 파일은 테스트 시작 전에 실패합니다. 파일 개수보다 측정 시간을
기준으로 균형을 맞춥니다. shard 개수를 바꾸면 workflow matrix와 shard/report
인수도 함께 변경해야 합니다.

각 실행은 자신의 `shard-N-of-M.json`을 교체합니다. 병합기는 불완전·중복·실패·skip
결과와 서로 다른 소스의 결과를 거절합니다. 소스·fixture·의존성 잠금·CI 설정을
바꾸면 모든 shard를 다시 실행합니다. 결과는 진단 자료이며 테스트 실행을 대신하는
캐시가 아닙니다.

CI는 개별 shard 보고서와 통합 `ui-browser-results` artifact를 14일 보존합니다.
일부 shard의 성공은 전체 family 인수 통과가 아닙니다. 전체 로컬 실행과 성공한
병합은 `packages/svelte-ui/test/results/current.json`을 기록합니다.

## 시간 목표

설치·빌드·검증·보고서 통합을 포함하는 필수 CI 전체 경로의 기본 목표는
**5분 이내**, 추가 목표는 **3분 이내**입니다. GitHub 러너 배정 대기는 따로
집계합니다. 전체 러너 사용 시간도 함께 확인하며 같은 검사를 두 번 분산 실행한
것을 개선으로 계산하지 않습니다. 작업 timeout은 안전 한도이며 성능 목표가 아닙니다.

같은 리비전을 반복 실행하고 cold/warm cache와 실패 증거를 남기며, 전체 인수
범위를 유지합니다. 실제 관측과 한계는 [최적화 인계](handoff/ci-optimization-2026-11-03.md)에
기록합니다. 로컬 하네스 측정을 원격 CI 측정으로 보고하지 않습니다.
