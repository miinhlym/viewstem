# 소비자 스킬의 Codex 지원 범위 — 2026-11-06

사용자 결정 D129에 따라 **현재 지원·검증 대상은 Codex로 한정하고 Claude Code를 첫 배포의 필수 조건에서 제외한다.** D119의 두 호스트 동시 첫 지원 조건을 대체한다. 공통 스킬 본문과 호스트별 설치 안내를 분리하는 구조, 파일 접근·Node.js 실행 환경, 라이브러리와 스킬의 별도 설치는 유지한다.

## 설치·실행 시도와 제거

사용자 요청으로 공식 native installer의 stable 채널에서 Claude Code 2.1.311을 설치했다. `claude --version`과 배포 manifest의 SHA-256 대조는 통과했다. CLI 인증 상태는 `loggedIn: false`였고, 최소 모델 호출은 `Not logged in · Please run /login`으로 종료됐다. API 실행 시간과 토큰 사용량은 0이었다. 이를 스킬 실행이나 행동 검증으로 계산하지 않는다.

이후 사용자가 CLI 제거와 Claude Code 제외를 요청했다. 이번 작업의 로그인 프로세스를 종료하고 `~/.local/bin/claude` 및 해당 링크가 가리키던 `~/.local/share/claude/versions/2.1.311`을 제거했다. 제거 전 실행 파일 SHA-256은 `85d8c08707fcfd1e78ffa0204eefbc6ec9e4fe22f375fb2767ef85d957ed3161`이다. 새 로그인 셸에서 `command -v claude`가 경로를 반환하지 않는 것을 확인했다. 기존 사용자 설정·개인 스킬은 보존했다. [공식 제거 절차](https://code.claude.com/docs/en/setup#uninstall-a-native-installation)를 따랐다.

## 현재 지원과 증거

- Codex CLI: [2026-11-05 비교 결과](viewstem-skills-extended-2026-11-05.md)의 실제 검증 범위를 사용한다. 기준선 33/33, B2 32/33, B3 관련 과제 12/12와 비대상 본문 읽기 0/6은 당시 결과다.
- Codex의 desktop 전용·계정 업로드·클라우드별 발견 경로: 별도 실행 증거가 없으므로 검증 완료로 확대하지 않는다.
- Claude Code: 현재 지원·실행 검증 범위에서 제외한다. 설치 안내와 22개 준비 fixture는 미검증 참고 자료로 남기고 추가 로그인·설치·모델 실행을 요구하지 않는다.
- 지원 범위 변경 당시 스킬 본문과 Codex 발견 metadata는 B3 그대로였으며, 두 integration 안내의 지원 상태 문구만 변경했다. 같은 날 후속 런타임 수정에 따라 현재 본문의 구독 안내도 갱신했다. 이 본문으로 Codex 모델 비교를 다시 실행하지는 않았다. 이전 4파일 archive와 현재 폴더 전체가 같은 hash라고 주장하지 않으며, 발행 전 현재 파일 manifest와 archive를 새로 고정한다.

## 남은 배포 조건

Claude Code 미실행은 배포 차단 조건에서 제거한다. [View 구독 후 투영 불일치](view-subscription-projection-2026-11-05.md)는 같은 날 후속 작업에서 [제품 수정·회귀·원본 앱 재검증](view-subscription-projection-fix-2026-11-06.md)을 완료했다. 정확한 패키지 조합과 immutable 공개 ref 확보, 현재 스킬 파일의 배포 manifest 고정은 여전히 남아 있다. 따라서 지원 범위 변경과 런타임 수정만으로 공식 배포 준비 완료를 선언하지 않는다.

2026-11-05 평가 JSON, 실험 계획과 EGM snapshot은 당시 조건·결과를 보존한다. 과거의 두 호스트 배포 판단과 현재 범위가 다를 때에는 [현재 명세 §8.5](../VIEWSTEM-SPEC.md#85-외부-앱-개발용-공통-스킬)와 이 문서를 따른다.
