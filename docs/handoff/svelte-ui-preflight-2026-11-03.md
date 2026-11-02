# Svelte UI branch preflight

## 검토 기준과 범위

사용자가 요청한 Svelte UI 구현·예제·수정 전체의 사전 검토다. 원격 기본 브랜치 `main`을 fetch해 `origin/main`의 `af86b953a31ac08cf476ad6c812bf3397b396efb`를 확인했다. 검토 시작 HEAD는 `35b6ff9bf00d0856ab9d1e5ee7ec8a24365cc35e`이며 작업 트리는 깨끗했다.

원격 기준 20개 커밋·1,753개 변경 경로를 목록화했다. 이번 요청의 직접 검토 대상은 `e6451e5917476a2f63c83844634db2b92e2f1f8c` 뒤 9개 커밋의 764개 경로와 이번 미커밋 수정이다. 앞선 core·playground의 구현·preflight는 기존 인수 기록을 유지하고, 이번에 연결이 바뀐 core·Svelte 경계는 실제 패키지로 재검증했다. 전체 역사적 실험을 새로 감사했다는 뜻은 아니다.

| 대상 | 변경 경로 수 | 확인 방법 |
|---|---:|---|
| core 공개 API·타입·실행·테스트 | 60 | facade·Registry·Derived 갱신·수명·URL 계약과 회귀 검사 |
| Svelte renderer·기본 예제·검사 | 36 | 소유권·취소·교체·오류·등록·실제 DOM·공개 타입 |
| Svelte UI 제품 소스 | 568 | 작성한 bridge·recipe·정책 검토, 생성 소스는 원본·변환 소유자와 재생성 일치 검증 |
| UI 고정 원본·스크립트 | 16 | archive 해시·라이선스·카탈로그·CSS scope·exports·reporter 실패 검출 |
| UI 테스트·갤러리 | 26 | 66개군 동작 행렬·71개 JSON 예제·종류별 편집·폼·State/Action·한국어 입력 |
| playground 소비자 | 3 | 공개 API 변경 대조와 기존 U44 회귀 증거 재사용 |
| 문서 | 47 | 공개 지원·한계·소유 문서·실행 결과의 정합성 |
| CI·루트 및 패키지 설정 | 8 | Node 22/24 명령·lock·공개 경로·실제 tarball 소비자 |

생성된 vendor·family·schema·CSS·manifest는 각각을 별도 구현으로 수기 검토하지 않았다. 70개 고정 원본 항목의 해시, 66개군 exports, 원본 변환과 생성 소유자, 351개 JSON 부품·35개 native 문맥 부품·6개 recipe의 공개 구분을 대조했다. 이번 수정으로 의존성·생성 정책·CI 명령은 바꾸지 않았다.

## 발견과 수정

| 재현한 문제 | 수정 | 회귀 근거 |
|---|---|---|
| 호스트 URL unsubscribe/Clock stop 예외가 Scope·Store·View 폐기를 중단하고 URL 키·DOM 점유를 남김 | 호스트 오류를 안전한 진단으로 기록하고 남은 정리를 완료한다. renderer attachment도 View 폐기 실패와 무관하게 unmount와 target 해제를 완료한다. URL 초기 subscribe/read 실패에서도 이미 확보한 키·구독을 해제한다. | core cleanup·URL ready·transaction rollback, 실제 Svelte State 폐기·target 재사용, 주입 View disposer 실패 |
| 폐기됐거나 다른 Store의 Scope를 reaction 소유자로 받아 소유권 밖에서 반응이 지속됨 | 등록 전에 같은 Store의 살아 있는 Scope인지 확인한다. 다른 유효 Scope의 State를 관찰하는 기존 기능은 유지한다. | 잘못된 소유자 등록 거절·그래프 무변경·정상 소유자 폐기 후 반응 중단 |
| `createRenderer({ functions })`의 자동 Registry가 함수 정의를 알지 못해 실행 전 리소스 등록이 실패함 | 같은 함수 계약을 자동 Registry와 Runtime에 전달한다. 직접 전달한 Registry의 구성 책임은 기존 호스트 경계를 유지한다. | 사용자 함수가 있는 Variable 등록, Derived State와 실제 DOM의 `6 → 10` 갱신 |
| 갤러리가 `pagehide.persisted=true`에도 실행기를 폐기해 캐시 복원용 DOM이 비어짐 | 캐시 보존 전환에서는 실행기를 유지하고 최종 pagehide에서 정리한다. | 두 번의 persisted hide/show 동안 같은 입력 DOM·State/Action 보존, 최종 non-persisted 전환에서 preview 제거 |

core의 cleanup·reaction 문제는 기존 구현에 있던 결함이며 이번 Svelte 수명 검토에서 함께 드러났다. 수정 전 실패 로그와 관찰 결과는 [증거 폴더](svelte-ui-preflight-evidence/), 수정 후 실행과 해시는 [검증 결과](svelte-ui-preflight-verification-results.json)에 보존한다.

다른 Runtime의 View를 renderer가 빌리는 기능은 유지했다. 코드 Component 계약과 구현의 일치, 참조 ID의 코드형·선언형 구분이 필요하다는 기존 등록 조건을 [Svelte README](../../packages/svelte/README.md)에 명시했다. `resourceResolver`가 실행 Registry에 추가한 유효한 선언형 Component까지 거절하지 않도록, 호스트 Registry에 없는 모든 ID를 일괄 오류로 만드는 변경은 하지 않았다. 공개 API·제품 지원 범위를 새로 결정한 사항은 없다.

## 검증과 증거 재사용

정확한 명령·환경·통과 수·해시는 [검증 결과](svelte-ui-preflight-verification-results.json)가 소유한다. 검사는 실험 모형이 아닌 core 제품, 빌드한 Svelte/UI 공개 패키지, 격리 설치한 tarball을 대상으로 한다. 각 필수 사례의 이름을 실제 Node runner 결과와 연결하는 reporter도 필수 통과·누락·skip·실패·필수 외 실패의 다섯 시나리오로 확인했다.

기존 [U44 기록](svelte-ui-shadcn-verification-results.json)과 [U45 기록](svelte-ui-audit-verification-results.json)을 덮어쓰지 않는다. 변경하지 않은 UI 소스·생성 스크립트·고정 원본의 해시를 확인해 U45의 Node 22/24 빌드 일치 증거를 재사용한다. 변경된 core·renderer의 전체 테스트와 실제 UI 전체 결합 흐름은 다시 실행한다. 두 번째 Node 환경에서는 변경된 갤러리와 renderer를 확인하고, 동일 UI 소스·브라우저의 전체 동작 증거를 불필요하게 반복하지 않는다.

원격 전체 diff 공백 검사의 138개 지적은 `experiments/`의 기존 CEL patch 6개에 들어 있는 공백이며 이번 요청 이전부터 동일했다. 통일 diff 원문 보존을 위해 수정하지 않았다. 직접 검토 범위의 공백 검사는 기존 실패 원문 `docs/handoff/svelte-ui-audit-evidence/*-before.log`를 제외해 검사한다. 이 제외와 원격 검사 실패를 통과로 바꾸어 보고하지 않는다.

## 한계와 인계

- 브라우저 동작은 Chromium에서 검증했다. 기존 [66개군 감사의 한계](svelte-ui-audit-2026-11-03.md#검증-방식과-한계)는 유지하며 전체 props 조합·스크린리더·실제 모바일 터치·WebKit/Firefox 통과로 확대하지 않는다.
- 캐시 보존 회귀는 실제 DOM에 `PageTransitionEvent`를 dispatch해 수명 처리를 확인한다. 브라우저가 실제 뒤로/앞으로 이동에서 BFCache를 선택한다는 검증은 아니다. 초기 실제 이동 probe는 복원 여부를 확인할 수 없어 근거에서 제외했다. `persisted`의 의미는 [MDN pagehide 문서](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event)를 따른다.
- 호스트 `subscribe`가 callback을 설치한 뒤 cleanup 함수를 반환하기 전에 throw하면, 라이브러리는 전달받지 못한 외부 구독을 제거할 수 없다. 자기 키·내부 구독은 해제하고 남은 callback이 폐기된 연결을 변경하지 못하도록 차단한다.
- 원격 CI는 push/PR 후 실행되는 별도 gate다. preflight에서는 로컬 검사만 수행하고 commit·push·발행을 하지 않았다.
- preflight 종료 당시 작업 트리는 설명된 수정이 있는 dirty 상태였다. 로컬 `packages/svelte-ui/test/results/preflight-handoff.json`에 당시 base/head·diff fingerprint·알고리즘을 기록했다. 그 결과는 사람이 인계에 사용할 수 있지만 이후 커밋의 immutable SHA 증거로 재사용할 수는 없다. 이후 커밋·hook 변경 뒤에는 영향받은 검사와 clean fingerprint를 갱신해야 한다.

## 후속 분리 커밋 인계

preflight와 배포 준비 상태 설명 이후 사용자가 현재 수정의 분리 커밋을 요청했다. 구현·회귀 테스트는 각 동작 수정과 함께 묶었고, 검토·수정 전 증거·실행 결과·등록 조건 설명은 별도 문서 커밋으로 보존했다.

| 커밋 | 범위 |
|---|---|
| `7660666` | 호스트 URL·Clock 구독 실패 후 정리 완료와 회귀 테스트 |
| `26153af` | 잘못된 reaction 소유자 등록 거절과 회귀 테스트 |
| `a36f2e9` | Svelte 자동 Registry의 사용자 CEL 함수 공유·회귀·사용법 |
| `8df2408` | View 폐기 실패 후 Svelte DOM·target 해제와 회귀 테스트 |
| `42c9de2` | 갤러리 캐시 보존 전환의 State 유지·회귀·사용법 |

커밋 전에 preflight의 dirty diff fingerprint, 소스 트리 9개와 기록된 산출물·증거 18개의 SHA-256 일치를 확인했다. 분리 과정에서 제품 소스·테스트·설정은 수정하지 않았고 실행되는 Git hook도 없었다. 기존 core·Svelte·UI·패키지 소비자 검증을 재사용하며 새 전체 테스트 실행으로 표시하지 않는다. 각 staged diff의 공백 검사와 문서 링크·JSON 검사를 수행한다.

검증 결과 JSON의 `headSha`, `worktreeState: dirty`, commit 미실시 표기는 preflight 당시의 역사 기록으로 유지한다. 이번 후속 요청은 로컬 커밋만 승인했으며 push·버전 변경·라이선스 선택·npm 발행은 수행하지 않았다. 배포 준비 작업은 [후속 범위](open-contracts.md#실제-남은-작업)의 공개 발행 항목에 남아 있다.
