# T2 URL 쓰기 경합 독립 실험

URL 어댑터의 실제 반영 경계를 확인하는 독립 실험이다. **실제 Viewstem core·StateStore·renderer·HTTP 실행기가 아니다.** 같은 fixture를 Node의 메모리 URL과 별도 Chromium의 실제 `location`/History API에서 실행한다. 현재 사용자의 브라우저 프로필·탭·서비스 URL은 사용하지 않는다.

## 실행

Node 22 이상에서 메모리 실험은 의존성 설치 없이 실행할 수 있다.

```sh
cd experiments/t2-url-races
npm test
```

브라우저 실험은 Playwright 1.62.1과 해당 Chromium이 필요하다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
npm run test:browser
```

이번 검증에서는 lockfile로 설치한 Playwright와 이미 설치된 호환 Chromium을 사용했다. 브라우저 다운로드 명령을 재실행할 필요는 없었다. runner는 127.0.0.1의 임시 포트로 fixture 파일만 제공하고, 별도 headless 브라우저를 열어 각 사례의 실제 URL·방문 기록을 변경한다. 완료 시 브라우저·서버를 종료한다. 외부 서비스·API 요청은 없다.

`VIEWSTEM_TEST_MODULES`에 별도로 설치된 node_modules 절대 경로를 주면 그 위치의 Playwright를 사용할 수도 있다. 결과에 실제 버전을 기록한다. 기본 재현 경로는 위 lockfile 설치다.

## 결과

| 환경 | 대표 사례 | 잘못된 구현 대조군 탐지 | 쓰기 순서 반복 |
|---|---|---|---|
| Node 22.21.1 | 63/63 | 9/9 | 100/100 seed |
| Node 24.19.0 | 63/63 | 9/9 | 100/100 seed |
| Chromium 151.0.7922.34 / Playwright 1.62.1 | 63/63 | 9/9 | 20/20 seed |

`results/latest.json`, `results/node24.json`, `results/chromium.json`에 환경·사례별 실제 URL/commit trace·결과·실행 소스 및 lockfile SHA-256을 남긴다. 모든 환경의 정상 사례 trace가 같고, 공통 seed 결과도 같다. seed당 세 State를 번갈아 18회 쓰고 완료 순서를 섞는다. Node는 1,800회, Chromium은 360회 쓰기 요청을 실행했다. 전체 가능한 순서 탐색이나 성능 측정은 아니다.

`URL_RESULT=results/other.json node run.mjs`처럼 출력 위치를 지정할 수 있다. 사례 실패·대조군 미탐지·브라우저 pageerror는 종료 실패로 처리한다.

## 코드와 검증 범위

- `url-probe.mjs`: `read/subscribe/writeOwned` 형태의 지연 어댑터와 입력/쓰기 세대·baseline·미반영 key 합치기를 다루는 연결 모형. 실제 URL commit 직전 유효성을 검사하고 최신 URL에 소유 key만 합친다. 검사와 commit 사이에 await를 두지 않는다.
- `endpoints.mjs`: 메모리 주소와 실제 Chromium History를 같은 fixture에 연결한다. 브라우저의 뒤로/앞으로는 실제 `history.go()`와 `popstate`를 사용한다.
- `scenarios.mjs`: 새 쓰기·복원·폐기·교체, 비동기 준비 중 무효화, 외부 key/path/hash, baseline, null/문자열/배열/Set, byte/item 한도, 기록 방식과 실제 방문 기록 복원.
- `run.mjs`, `browser-run.mjs`: 실행과 원시 결과 저장. 대조군은 commit 검사 생략·시작 시에만 검사·옛 URL 전체 쓰기·대기 key 유실·복원 무효화 누락·비동기 준비 전에만 검사를 각각 재현한다.

추가 회귀 검사에서 키 순서 변경에 따른 중복 방문 기록과 변경되지 않은 push 항목의 잘못된 반영을 발견했다. 수정 전 결과는 `results/development-failure.json`에 보존했다. 해당 파일의 소스 해시는 최종 코드와 다르며 최종 실패 결과가 아니다.

## U32/U33 후속 경계와 교체 실패

U37–U55에서 baseline -0 정규화·격리, encoded 중복 key, 묶음 쓰기 원자성, 새 소유자/ABA 뒤 옛 cleanup 차단, 교체 후보 사전 검증·격리, cleanup 실패 후 새 연결 완료/진단/후속 쓰기, opaque 예외와 비동기 준비 실패를 확인했다. 고의 결함에 baseline 정규화 생략·새 소유자의 cleanup 무효화 생략·cleanup 오류 보고 누락을 추가해 총 9개를 탐지한다. 정상 사례 뒤 구독·Store/key 소유권·교체 기록이 남지 않는다.

[기존 36개 통과 소스](archive/u18-before-boundaries/README.md), [경계 수정 전 41/47](archive/u32-boundaries-before-fix/README.md), [정리 실패 정책 선택 전 관찰](archive/u32-cleanup-policy/README.md), [비동기 prepare 수정 전 60/61](archive/u33-preparation-before-fix/README.md)을 보존한다. 현재 계약과 전체 결과는 [후속 기록](../../docs/handoff/boundary-followup-2026-10-30.md)을 따른다.

`node replacement-failure.mjs replacement-failure-node24.json`은 일반 쓰기 실패와 교체 정리 실패의 U33 동작을 별도로 검사한다. Node 22에서는 해당 바이너리와 `replacement-failure-node22.json`을 사용한다. 새 연결은 유지되지만 옛 URL key가 남을 수 있음을 결과에 기록하며 정리 성공으로 표시하지 않는다. 이 별도 검사는 위 63개에 더해 전체 인수 완료로 합산하지 않는다.

## 한계

연결 모형의 값 검증은 string/유한 number/boolean, 선언 nullable, string/number 배열·Set fixture로 한정한다. 실제 JSON Schema·날짜 codec·StateStore·reaction/Query 초기화·renderer 수명과의 통합은 검증하지 않는다. 명시 교체는 새 설정을 사전 검증하고 이전 key 정리를 시도한 뒤 새 연결을 만드는 fixture다. U33에 따라 URL 정리 실패도 새 초기값으로 연결하고 동기화 오류를 보고한다. 전체 View 적용/초기 완료·renderer API나 동시 SPA 전환을 구현한 것은 아니다.

bytes는 실제 percent-encoded query 부분의 UTF-8 크기로 검사하며 값 한도는 encoded value, 소유 합계는 key=value 조각과 그 사이 `&`를 센다. 읽기 한도는 JSON 파싱 전에, 출력 한도는 최신 URL 병합 후 실제 commit 전에 확인한다. 도메인 전체 URL 길이나 다른 소유자의 값은 이 연결의 한도로 자르지 않는다.

Chromium 한 엔진의 로컬 History 검증이다. Firefox·WebKit·Dart, 서비스 router, 브라우저 보안 정책 전체에 대한 적합성 증거로 확대하지 않는다. [현재 URL 계약](../../docs/spec/09-preserved-contracts.md#url-동기화의-확정-의미), [실험 판단·남은 작업](../../docs/handoff/t2-url-races-2026-10-29.md)을 따른다.
