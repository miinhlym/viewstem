# 지속적 통합

[English](ci.md) | 한국어

[core 워크플로](../.github/workflows/core.yml)는 `main` push, PR, 수동 실행에서
동작합니다. 같은 PR이나 브랜치의 새 실행은 이전 실행을 취소합니다.
필수 검사는 모든 호환성 작업과 브라우저 검증에 의존하는
**CI complete**를 사용합니다.
PR이 없는 다른 브랜치의 push는 CI를 자동 실행하지 않습니다. 해당 브랜치는
PR이나 수동 실행으로 확인합니다.

## 검사와 환경

- Node 22·24에서 core와 Svelte 어댑터, 브라우저 UI를 빌드하고 core·Svelte 타입과 tarball 소비자를 검사합니다.
- Chromium에서 core·Svelte 브라우저 테스트와 UI tarball 소비자 테스트를 실행합니다. UI 검사는 순수 JS·React·Vue·Svelte 호스트, 원본 66개 계열의 JSON, 날짜·테이블의 State와 이벤트를 다룹니다.
- **CI complete**는 호환성 검사와 브라우저 검사가 모두 성공해야 통과합니다.

로컬에서는 `npm run check:ui`, `npm run check:svelte`, `npm run test:ci`를 실행합니다. CI 브라우저는 Playwright Chromium의 headless shell을 사용합니다.

## npm 릴리스

공개 패키지에 반영할 변경이 있는 PR은 루트에서 `npx changeset`을 실행하고
생성된 파일을 함께 커밋합니다. 영향을 받는 패키지, SemVer 변경 수준, 변경
이력에 들어갈 요약을 선택합니다. `core`, `svelte`, `ui`의 버전은
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
   `main`에서 `npm ci --ignore-scripts`, `npm run build:svelte && npm run build -w @viewstem/ui`,
   `node .github/scripts/npm-release.mjs pack-initial /tmp/viewstem-release`를
   실행합니다. tarball의 문서 링크는 빌드한 소스 커밋을 가리킵니다.
2. `npm publish <tarball> --access public`과 대화형 2FA로 core, svelte,
   ui 순서로 공개합니다. 해당 소스 커밋에 각 패키지 태그를 기록합니다.
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
