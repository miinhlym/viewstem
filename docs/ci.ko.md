# 지속적 통합

[English](ci.md) | 한국어

[core 워크플로](../.github/workflows/core.yml)는 `main` push, PR, 수동 실행에서
동작합니다. 같은 PR의 새 실행은 이전 실행을 취소합니다. Push는 커밋별로 묶고
수동 CI는 별도 그룹을 사용하고 **Manual CI complete**로 결과를 표시합니다.
필수 검사는 **CI complete**를 사용합니다.
PR이 없는 다른 브랜치의 push는 CI를 자동 실행하지 않습니다. 해당 브랜치는
PR이나 수동 실행으로 확인합니다.

## 검사와 환경

- Node 22·24에서 Core·DOM·Svelte·UI를 빌드합니다. 호환성 검사에서는 Core·DOM·Svelte 타입과 설치된 패키지의 소비 경로를 확인합니다. 독립 DOM 설치와 혼합 렌더링도 포함합니다.
- Chromium에서 Core·DOM·Svelte 브라우저 테스트와 UI tarball 소비자 테스트를 실행합니다. UI 검사는 순수 JS·React·Vue·Svelte 호스트, 원본 66개 계열의 JSON, 날짜·테이블의 State와 이벤트를 다룹니다.
- **CI complete**는 호환성 검사와 브라우저 검사가 모두 성공해야 통과합니다.

변경한 패키지에 맞춰 로컬 검사를 선택합니다. DOM 렌더러·CSS 변환은 `npm run check:dom`, UI 카탈로그는 `npm run check:ui`, Svelte 렌더러는 `npm run check:svelte`, 릴리스 계획은 `npm run test:ci`로 확인합니다. CI 브라우저는 Playwright Chromium의 headless shell을 사용합니다.

## npm 릴리스

공개 패키지의 새 버전에 반영할 변경이 있으면 PR에 changeset을 추가합니다.

### Changeset 작성하기

1. 저장소 루트에서 `npx changeset`을 실행합니다. 영향을 받는 패키지를 선택하고
   각각의 SemVer 변경 수준을 정합니다. `core`, `dom`, `svelte`, `ui`의 버전은
   독립적으로 관리합니다.
2. 요약은 패키지 변경 이력에 들어갑니다. 어떤 기능이 바뀌고 사용자에게
   무엇이 달라지는지 씁니다. 일반적인 패치는 짧은 한 문장으로 요약합니다.
   구현 세부사항과 전체 벤치마크 결과는 PR에 남깁니다.
3. 사용자가 영향을 이해하는 데 도움이 될 때 변경 이유를 덧붙입니다.
   사용자 코드 수정이 필요하면 이관 방법을 쓰고, 자세한 절차가 필요하면
   기존 가이드를 연결합니다.
4. 생성된 `.changeset/*.md` 파일에서 패키지 이름, 버전 변경 수준, 요약을 확인한 뒤
   PR에 함께 커밋합니다.

패치 요약은 “View를 교체할 때 관련 없는 URL 파라미터를 보존합니다” 또는
“DataTable과 관련 없는 View 갱신 시 행과 포커스를 유지합니다”처럼 씁니다.
[Changesets 공식 작성 가이드](https://changesets.dev/guide/writing-changesets)

### Release PR

`main` CI가 성공하고 대기 중인 changeset에 공개 패키지 버전 변경이 있으면 Changesets가 Release PR을 열거나
갱신합니다. Release PR에는 새 버전, 필요한 내부 의존성 변경, 갱신한 npm lockfile이
포함됩니다.
`GITHUB_TOKEN`으로 만든 PR의 CI는 GitHub에서 관리자가 실행을 승인해야
할 수 있습니다. **CI complete** 통과 후 Release PR을 병합합니다.
병합 커밋에서도 같은 검사가 통과하면 npm 발행을 준비합니다. Release PR CI와
발행 워크플로는 각각 PR 기준 커밋과 병합 직전 커밋에서 Changesets 결과를 임시
디렉터리에 다시 생성합니다. 매니페스트, 변경 이력, 소비된 changeset 등 생성된 파일을
후보 커밋과 대조하고 npm은 lockfile을 별도로 검증합니다. 이미 낡은 릴리스 결과는
발행을 차단합니다. 이전 패키지 버전은
모두 공개돼 있어야 합니다. 내부 의존성 버전은 이미 공개됐거나 같은 배치에서
먼저 발행돼야 합니다. npm 발행이 성공하면 문서 잡은 공개 버전을 확인하고 같은
커밋을 배포합니다. `@viewstem/core@0.1.1`과 같은 패키지 태그와 GitHub Release는
별도 잡에서 기록합니다.

문서만 바뀐 PR은 changeset 없이 평소처럼 머지합니다. 사이트를 별도로 공개하려면
**Deploy docs**를 수동으로 실행합니다. [배포 절차](../apps/docs/README.ko.md#패키지-릴리스와-별도로-문서-배포)를 따릅니다.

일부 발행에 실패하면 다음 배치를 진행하기 전에 같은 커밋의 실패한 잡을
재실행합니다. 이미 발행된 버전의 tarball 무결성이 일치하면 건너뜁니다.
별도 발행으로 이미 `latest`가 앞섰다면 이전 배치를 재시도하기 전에
레지스트리에서 누락 버전을 복구합니다. 발행에 성공하고 사이트만 실패했다면
원래 실행의 문서 잡을 재시도합니다. 태그나 GitHub Release 생성 실패는
해당 기록 잡에서 재시도합니다.

### Trusted Publishing 설정

공개 npm 패키지마다 GitHub 소유자 `miinhlym`, 저장소 `viewstem`,
워크플로 파일 `core.yml`을 Trusted Publisher로 지정하고 직접 `npm publish`를
허용합니다. `core.yml`은 `npm-release.yml`을 호출합니다. 새 연결은 npm의
2일 이내 검증 기간에 맞춰 첫 OIDC 발행 직전에 설정합니다.
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)

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
