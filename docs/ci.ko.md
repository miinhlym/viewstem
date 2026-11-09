# 지속적 통합

[English](ci.md) | 한국어

[core 워크플로](../.github/workflows/core.yml)는 `main` push, PR, 수동 실행에서
동작합니다. 같은 PR이나 브랜치의 새 실행은 이전 실행을 취소합니다.
필수 검사는 모든 호환성 작업과 브라우저 shard 및 통합 인수 검증에 의존하는
**CI complete**를 사용합니다.
PR이 없는 다른 브랜치의 push는 CI를 자동 실행하지 않습니다. 해당 브랜치는
PR이나 수동 실행으로 확인합니다.

## 검사와 환경

| 작업 | 환경 | 검사 |
|---|---|---|
| Node compatibility | Node 22.21.1·24.1.0, Ubuntu | 세 패키지 빌드, core 테스트·타입·인수 대응, CI 도구 회귀, Svelte/UI 타입, 생성 소스 재현, 세 tarball 설치 소비자 |
| Browser integration | Node 24.1.0 UI shard 4 안에서 실행 | core 브라우저 동작, Svelte renderer |
| UI browser | Node 24.1.0, Chromium, Ubuntu 작업 4개 | 모든 UI 브라우저 파일; 사례별 독립 context/page와 shard 안의 파일 순차 실행 |
| CI complete | Node 24.1.0, Ubuntu | 선행 작업 전체 성공; shard의 소스·리비전·환경 일치; 누락 파일·중복 사례·실패·skip·todo 없음; 66개 family 계약 전체 검증 |

브라우저 동작은 shard 전체에서 한 번씩 실행하며, Node별 빌드·패키지 설치는
두 버전에서 검사합니다. 테스트 배치를 변경하며 공개 API나 컴포넌트 지원 동작은
바뀌지 않습니다. 테스트는 빌드한 공개 패키지 export를 사용합니다.
카탈로그·tarball 검사는 전체 컴포넌트를 등록하고, 개별 동작 검사는 View에서
참조하는 컴포넌트의 family 전체를 등록합니다.

현재 브라우저 검사는 모두 Playwright의 기본 headless shell을 사용하므로 CI는
`--only-shell`로 Chromium을 설치합니다. 향후 headed 테스트나 명시적 `channel`을
추가하면 설치 명령도 다시 확인해야 합니다.

## 로컬 검사와 shard 관리

`npm run check:svelte-ui` 등 기존 명령은 계속 전체 로컬 검증을 실행합니다.
Svelte UI shard 실행과 보고서 병합을 재현하려면 다음을 실행합니다.

```sh
npm run build:svelte-ui
npx playwright install chromium
npm run test:ci
npm run test -w @viewstem/svelte-ui -- --shard=1/4
npm run test -w @viewstem/svelte-ui -- --shard=2/4
npm run test -w @viewstem/svelte-ui -- --shard=3/4
npm run test -w @viewstem/svelte-ui -- --shard=4/4
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
소스 해시는 stage하지 않은 추가·수정·삭제도 반영합니다. Native 테스트 그룹은
개별 사례와 따로 기록하며, 그룹 정리 단계의 실패나 그룹 결과 누락도 실패 처리합니다.

CI는 개별 shard 보고서와 통합 `ui-browser-results` artifact를 14일 보존합니다.
일부 shard의 성공은 전체 family 인수 통과가 아닙니다. 전체 로컬 실행과 성공한
병합은 `packages/svelte-ui/test/results/current.json`을 기록합니다.

## npm 릴리스

공개 패키지에 반영할 변경이 있는 PR은 루트에서 `npx changeset`을 실행하고
생성된 파일을 함께 커밋합니다. 영향을 받는 패키지, SemVer 변경 수준, 변경
이력에 들어갈 요약을 선택합니다. `core`, `svelte`, `svelte-ui`의 버전은
독립적으로 관리합니다. Release PR에는 내부 의존성 변경과 갱신한 npm
lockfile도 포함됩니다.

`main` CI가 성공하면 Changesets가 Release PR을 열거나 갱신합니다.
`GITHUB_TOKEN`으로 만든 PR의 CI는 GitHub에서 관리자가 실행을 승인해야
할 수 있습니다. **CI complete** 통과 후 Release PR을 병합합니다.
병합 커밋에서도 같은 검사가 통과하면 npm에 발행합니다. npm 발행이
성공한 뒤 `@viewstem/core@0.1.1` 같은 패키지 태그와 GitHub Release를
생성합니다. 일부 발행에 실패하면 같은 커밋의 실패한 잡을 재실행합니다.
이미 발행된 버전의 tarball 무결성이 일치하면 해당 버전은 건너뜁니다.

### 첫 공개 발행

1. npm `@viewstem` 스코프에 발행 권한이 있는지 확인합니다. 깨끗한 검증 완료
   `main`에서 `npm ci --ignore-scripts`, `npm run build:svelte-ui`,
   `node .github/scripts/npm-release.mjs pack-initial /tmp/viewstem-release`를
   실행합니다. tarball의 문서 링크는 빌드한 소스 커밋을 가리킵니다.
2. `npm publish <tarball> --access public`과 대화형 2FA로 core, svelte,
   svelte-ui 순서로 공개합니다. 해당 소스 커밋에 각 패키지 태그를 기록합니다.
3. 각 npm 패키지에 Trusted Publisher를 추가합니다. GitHub 소유자는
   `miinhlym`, 저장소는 `viewstem`, 워크플로 파일은 `core.yml`이고
   직접 `npm publish`를 허용합니다. `core.yml`에서 `npm-release.yml`을
   호출합니다. npm의 2일 이내 검증 기간에 맞춰 첫 OIDC 발행 직전에
   연결합니다. [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)

저장소 Actions 설정에서 GitHub Actions의 PR 생성을 허용해야 합니다.
Release PR 잡에 PR 쓰기 권한을 주고, npm 발행 잡과 태깅 잡에는 각각
OIDC 및 contents 쓰기 권한을 줍니다.

## 시간 목표

설치·빌드·검증·보고서 통합을 포함하는 필수 CI 전체 경로의 기본 목표는
**5분 이내**, 추가 목표는 **3분 이내**입니다. GitHub 러너 배정 대기는 따로
집계합니다. 전체 러너 사용 시간도 함께 확인하며 같은 검사를 두 번 분산 실행한
것을 개선으로 계산하지 않습니다. 작업 timeout은 안전 한도이며 성능 목표가 아닙니다.

같은 리비전을 반복 실행하고 cold/warm cache와 실패 증거를 남기며, 전체 인수
범위를 유지합니다. 실제 관측과 한계는 [최적화 인계](handoff/ci-optimization-2026-11-03.md)에
기록합니다. 로컬 하네스 측정을 원격 CI 측정으로 보고하지 않습니다.
