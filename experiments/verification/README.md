# 전체 검증 추적

[coverage.json](coverage.json)은 현재 인수 216개와 선택 차트 8개의 원문 위치·검증 상태를 추적한다. `needs-evidence-audit`는 미검증 판정이 아니라 기존 증거와의 항목별 대조가 아직 끝나지 않았다는 뜻이다. 임의로 모든 항목을 통과로 채우지 않는다.

상태는 `needs-evidence-audit`, `pending`, `partial`, `verified-experiment`, `decision-needed`로 구분한다. verified-experiment도 실제 core/renderer 구현의 통과를 의미하지 않는다. 증거에는 실행 파일·시나리오·결과 파일·남은 제한을 연결한다. [진행 순서와 완료 기준](../../docs/handoff/verification-ledger.md)을 따른다.

`node experiments/verification/audit-evidence.mjs`는 224개 ID·계약 원문 줄·증거 경로·정확한 테스트 ID·실제 판정·현재 소스 hash를 대조하고 `evidence-integrity.json`을 갱신한다. 통과해도 항목의 모든 의미를 검사했다는 증명이 아니므로 시나리오 내용 대조와 구별한다. `earlierAudits`는 직접 실행 증거를 아직 찾지 못했던 이전 조사 기록이며 현재 통과 증거에 합산하지 않는다.

`supportingEvidence`는 T1 카탈로그/정규식·T3 타입 검증처럼 여러 계약에 걸친 보조 증거다. 보고서 안에 새로 생긴 실패가 인수 항목에 아직 연결되지 않았더라도 탐지한다. K05처럼 `passed:false`로 명시 추적한 미해결 실패는 별도 집계하며 무결성 통과로 해결했다고 표시하지 않는다.

추가 경계는 `node experiments/verification/cross-boundaries.mjs cross-boundaries-node24.json`(6개: Concat·배열 입력·정규화 전 host 열 목록·Derived ref/inline)과 `node experiments/verification/query-ui-integration.mjs query-ui-node24.json`(2개: 복합 실패·부분 재사용 중 UI 상태 보존)으로 재실행한다. 두 모듈 모두 Node 22/24에서 통과했으며 실제 core나 전체 renderer를 구현한 것은 아니다.

U35의 `node experiments/verification/action-ui-integration.mjs action-ui-node24.json`은 실제 UIProbe 확장과 ActionProbe를 private adapter로 연결한 11개 묶음이다. 조건·on 제거/재생성, 반복 재정렬/항목별 취소, owner 격리, Row 이동, 잘못된 화면 변경 보존, 부모/자식 취소, actionRef/componentRef 교체, 실제 State 쓰기로 자기 연결 제거를 Node 22/24에서 검증했다. State capability는 host fixture의 명시 연결이며 생산 UI의 일반 State 포트나 `/actions` 초기 평가까지 구현했다는 뜻은 아니다. 기존 A14 초기 평가 증거와 구별한다.

브라우저 실험 bundle은 이 폴더의 고정된 esbuild 도구를 사용한다. `npm ci --ignore-scripts --no-audit --no-fund` 후 `node date-integration.mjs date-integration-node24.json`으로 실제 localhost HTTP·Chromium History 날짜 경계를 실행한다. Playwright는 t2-url-races의 고정 설치를 사용한다. 외부 서비스·실제 인증정보를 사용하지 않는다.
