# View 구독 재진입 후 투영 불일치 수정 — 2026-11-06

상태: **원인 확정, core 수정, 회귀 테스트와 원본 실패 앱 재검증 완료.** 공개 패키지를 발행하거나 기존 모델 평가 결과를 다시 판정하지 않았다. [최초 발견 기록](view-subscription-projection-2026-11-05.md)과 당시 실패 결과는 보존한다. 현재 계약은 [호스트 통합](../spec/07-host-integration.md), 결정 이력은 D131, 실행 증거는 [결과 JSON](view-subscription-projection-fix-results.json)을 따른다.

## 원인

`View.refresh()`는 `planning` 중 들어온 요청을 즉시 반환하여 버렸다. 이 구간에는 `project()`가 구독자에게 snapshot을 동기 전달하는 시간도 포함된다. 원본 앱은 Query 성공 통지에서 `View.subscribe` 콜백이 `loadedText` State를 변경한다. StateStore는 값을 정상 커밋하고 View 재계산을 요청하지만, 위 guard 때문에 그 요청이 사라졌다. 따라서 Query와 State의 실제 값은 바뀌고 노드 입력·화면은 이전 값에 남았다. `queued`도 설정되지 않아 `initialComplete`가 후속 투영 없이 완료될 수 있었다.

원래 구현에 새 회귀 테스트를 먼저 실행했을 때 4개 중 2개가 실패했다. Query 데이터와 State가 정상이어도 노드 입력이 `''`였고, 연속 쓰기의 마지막 값 `final`도 발행되지 않았다. 이 결과는 StateStore 쓰기 실패나 renderer 통지 누락이 아니라 투영 재계산 요청 유실을 확인한다.

## 수정과 회귀

[런타임](../../packages/core/src/runtime.mjs)의 `planning` guard에서 기존 `schedule()`을 호출하도록 바꿨다. `queued`가 중복 예약을 합치고, 현재 불변 snapshot 통지를 마친 뒤 microtask에서 다시 계산한다. 기존 `project()`의 `!queued` 완료 조건으로 후속 투영 이전의 초기 완료도 방지한다. 폐기된 View에서는 예약 작업이 발행되지 않으며, 교체된 View에서는 현재 정의와 수명으로 계산한다. StateStore·Svelte renderer·공개 API 시그니처는 변경하지 않았다.

[회귀 테스트](../../packages/core/test/runtime-subscription-projection.test.mjs)는 공개 패키지 API로 다음 4개를 검증한다.

1. Query → View 구독 → State 변경 후 `initialComplete` 시점의 Query·State·노드 입력 일치.
2. 여러 State 쓰기의 후속 투영 병합, 현재 snapshot의 일관성, 재귀 통지 방지와 같은 값 쓰기의 종료.
3. 구독 콜백 안에서 State를 쓴 뒤 폐기하면 예약 투영이 발행되지 않음.
4. 구독 콜백 안에서 State를 쓴 뒤 View를 교체하면 이전 값·수명이 복원되지 않음.

수정 뒤 4/4가 통과했다. 독립 검토는 이 파일과 Derived·기존 runtime 회귀를 합쳐 15/15를 확인했으며 추가 결함을 보고하지 않았다. 이 계약은 **진행 중인 투영**에서 발생한 재진입 쓰기의 처리다. 최초 `subscribe()` 등록 콜백을 포함해 모든 호출이 항상 비동기·비재귀라는 뜻은 아니며 DOM 반영은 renderer에서 별도로 관찰한다.

## 원본 앱의 패키지 교체 비교

기존 Codex 산출물 `codex-form-refresh-B2-r3`를 두 임시 소비자 폴더로 복사했다. 원본 `src/app.ts`의 SHA-256은 `3011401cdfb4369c86c0eed0fb52365d76c73419ac688d6e701c1eb5a8e15158`로 전후 동일하다. bootstrap·tsconfig·HTML도 그대로 유지했다. 새 폴더에서는 수정한 core tarball만 설치했으며 renderer·UI를 포함한 core 외 의존성 파일 19,060개가 동일함을 hash로 확인했다. 복사 폴더에서 기존 renderer·UI tarball을 찾도록 manifest의 파일 경로만 절대 경로로 맞췄다.

검사기는 기존 [extended-browser.mjs](../../skills/tests/extended-browser.mjs)의 `form-refresh`를 그대로 사용했다. Svelte 실제 compiler와 Chromium 151.0.7922.34에서 실행했다.

| 관찰 | 기존 core 패키지 | 수정 core 패키지 |
|---|---|---|
| TypeScript 검사·브라우저 bundle | 통과 | 통과 |
| 초기 `Loaded: Initial`와 저장 후 `Loaded: Ada` 표시 | 실패: 표시 대기 시간 초과 | 통과: `load → save:Ada → load` |
| 실패한 저장 후 기존 값 유지·재조회 없음 | 선행 표시를 기다리다 실패 | 통과: `save:Reject` 이후 추가 load 없음 |
| View 폐기 후 UI 제거 | 통과 | 통과, 남은 노드 0 |
| 브라우저 오류 | 0 | 0 |

TS 전용 앱이라 Svelte 검사기의 “No svelte input files” 경고 1개는 전후 공통이며 오류는 0개다. 우회 코드나 선언형 Query 바인딩으로 앱을 바꾸지 않고 원래 구독 코드가 성공하는 것을 확인했다.

수정 tarball은 개발 버전 `@viewstem/core@0.1.0`이며 SHA-256은 `fc69062fa1187bb796a19f79eba391cb1b3808a7fa23fd7d27daebee833d4dc2`다. 동일 버전의 이전 개발 산출물과 구분해야 한다. 기존 core·renderer·UI의 hash와 새 core integrity는 결과 JSON에 남겼으며, 새 tarball의 전체 파일이 현재 core 패키지 파일과 동일함도 확인했다.

## 검증 범위와 후속 상태

| 실행 | 결과 |
|---|---|
| Node 22.21.1 `npm run check` | 1084/1084, skip·todo 0, strict 타입 검사와 core 216·optional charts 8 계약 매핑 통과 |
| Node 24.19.0 `npm run test:report`, `npm run typecheck`, `npm run check:coverage` | 1084/1084 및 타입·계약 매핑 통과 |
| Node 22·24 `npm run test:package` | 설치된 패키지 runtime·공개 경계 7개·소비자 타입·파일·라이선스 통과 |
| Node 22 `npm run test:browser` | CEL Node 25/25·Chromium 25/25, core 브라우저 7/7, 오류 0 |
| Node 22 `npm run check:svelte` | 소스·예제 strict 검사 오류·경고 0, 30/30, tarball 소비자 타입·브라우저 통과 |
| 원본 앱의 기존/수정 core 비교 | 동일 앱: 기존 실패 재현, 수정 뒤 3개 브라우저 assertion 모두 통과 |

README·타입 설명·호스트 계약에 후속 투영 의미를 명시하고 미해결 목록에서 이 문제를 제거했다. 스킬 본문의 오래된 제한 안내도 후속 snapshot과 설치된 버전의 계약 확인 안내로 바꿨다. 이 문구로 Codex 모델 비교를 새로 실행하지 않았으므로 이전 B3 실험의 hash·통과율을 현재 본문의 측정값으로 취급하지 않는다. Claude Code는 현재 지원·검증 대상에서 계속 제외한다.

확인한 런타임 결함은 해결됐다. 공개 ref, 배포할 정확한 패키지 조합과 현재 스킬 archive 고정은 [지원 범위 인계](viewstem-skills-scope-2026-11-06.md)의 별도 발행 조건으로 남는다.
