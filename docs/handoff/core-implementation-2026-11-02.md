# U37 · JS/TS core 구현 인수인계

기준 커밋은 `10a326b9c623aaf2763375b8628635dd70ba65d8`이다. U37 요청으로 기존 core 구현 보류를 해제하고 `packages/core`의 실제 패키지를 구현했다. 이 기록은 앞선 실험 모형 완료와 구별한다. 기존 `experiments/`, 그 결과·실패 archive는 변경하지 않았다.

## 완료한 범위

`@viewstem/core` 0.1.0의 ESM 공개 진입점, `@viewstem/core/http`, TypeScript 선언, CEL 지원 JSON, 고정 패치 빌드, npm tarball을 구성했다. 공통 Registry·스키마·값 표현식, 하나의 StateStore, Query 사용 수명, Action, headless Component/View 실행을 연결했다. 후속 사용자 요청에 따라 구현 코드·테스트·검증 결과·인수 문서를 한 로컬 커밋으로 보존한다. npm 발행·원격 push는 수행하지 않았다.

- 7종 리소스의 원자 등록, `(kind,id)` 조회, ref/inline, 정적 순환·타입·capability 검증.
- 안정적인 native 값 snapshot, State scope/Derived/reaction/Clock, 초기값·명시 쓰기 경합, 공통 변경 묶음.
- sources/transform/Join/Concat, 사용 인스턴스별 캐시·취소·최신 결과·polling·refresh/retry·stale, 실제 fetch HTTP 및 서버 secret/Login 실행 경계.
- 순차 Action·If/Assert·output/void, 실제 State/Query capability, 부모 연결 하위 호출, 독립 외부 호출, 완료 효과 비롤백.
- 슬롯 작성자 문맥과 이름별 투영, 이벤트 payload, 조건/반복 동일성, 입력 대기 중 수명, 원자 update/replace, progressive snapshot과 initial 완료, 목록·설명·권한·정의 추출.
- 실제 StateStore URL 연결과 History 경합, 정확한 소유 키 변경, 교체 사전 검증·cleanup 실패 처리. Grid는 순수 배치 함수이며 UI를 자동 등록하지 않는다.

실제 사용법은 [패키지 README](../../packages/core/README.md), 정확한 타입은 [index.d.ts](../../packages/core/src/index.d.ts)와 [http.d.ts](../../packages/core/src/http.d.ts)를 따른다. 초기 SDK 의사 코드의 이름을 그대로 공개 API로 복사하지 않았다.

## 관찰 가능한 완료 기준과 결과

[core 인수 대응표](core-acceptance-coverage.json)는 원래 224개 목록을 모두 보존하고 **core 216개를 실제 제품 테스트에 연결**, 선택 차트 X01–X08은 `deferred-optional-chart`로 구별한다. `check-coverage.mjs`가 각 인수 항목의 정확한 테스트 이름·파일을 실제 실행 보고서와 대조한다. 테스트 이름에 ID가 들어 있다는 이유만으로 통과 처리하지 않는다.

| 검증 | 실제 결과 |
|---|---|
| Node 22.21.1 전체 제품 검사 | 1,017/1,017 통과 |
| Node 24.1.0 전체 제품 검사 | 1,017/1,017 통과 |
| 인수 항목 ↔ 실행 파일/이름 자동 대조 | core 216/216, 선택 차트 제외 8/8 명시 |
| TypeScript strict 소비자 검사 | 공개 package import, 양성/음성 타입·추론 검사 통과 |
| CEL Node/Chromium 대조 | 각각 25/25, pageerror 0 |
| 실제 Chromium 151.0.7922.34 UI/History/HTTP | 7개 결합 검사, pageerror 0 |
| 의존성 재설치 후 빌드 | `npm ci --ignore-scripts` 및 고정 패치/해시 검증 통과 |
| 독립 디렉터리 tarball 설치 | runtime·타입 소비자 통과, 두 진입점/지원 JSON/선언/README 포함 |

1,017은 Node test-runner가 실행한 이름 있는 검사 수이며 인수 항목 수와 다르다. HTTP 261개·동적 경로 152개도 이제 개별 이름으로 보고한다. 스키마 내부 2,484개 Ajv 비교와 CEL 내부 216개 회귀는 해당 검사 안에서 실행되며 총수에 중복 합산하지 않았다. 최종 환경·산출물·소스 해시는 [검증 결과](core-verification-results.json)에 남긴다. 상세 실행 보고서는 `npm run test:report`로 `packages/core/test/results/current.json`에 재생성한다.

브라우저 검사는 실제 패키지를 bundle한 작은 **테스트 전용** DOM/History 어댑터다. URL 복원→최초 HTTP→Derived CEL, native 입력→Action→State→표시, URL 소유 키/원래 인코딩 보존, 실제 뒤로 가기, false 반환 성공, 교체 후 새 초기값/서비스 State 보존을 검사했다. Svelte 제품 렌더러 완료를 뜻하지 않는다.

## 구현 중 발견해 수정한 결합 결함

- URL pending 초기값/오류 기준선 유실, 명시 쓰기가 먼저 완료된 경우 URL 준비가 영구 대기하는 문제, 교체 전 설정 검증 누락.
- 반복 노드 재생성과 StateStore 관찰 통지의 재진입, 앞선 형제에서 Action 상태를 읽는 문제, 이벤트 타입/누락 속성 오류 분류.
- 공용 정의 변경을 기존 화면이 자동 추종하던 문제. View는 주입 시 Registry 스냅샷을 가지며 명시 replace/새 mount가 새 정의를 주입한다.
- 일시적인 입력 missing/error에서 기존 중첩 State·Query·Action 수명을 없애던 문제. 실제 제거와 입력 준비 상태를 분리했다.
- State 포트가 바뀌어도 이전 reaction 연결이 남던 문제, 교체·target 교환의 임시 reaction 충돌, 상태+구성 변경에서 이전 reaction이 실행되던 문제.
- 두 단계 변경 준비의 임시 `when:false`가 최종 유지되는 인스턴스를 재생성하던 문제. 원자 변경 전후의 실제 수명을 기준으로 유지한다.
- running 알림에서 동일 Action을 재진입해 중복 시작하던 문제. 실행 잠금을 알림 전에 설정한다.
- 브라우저 native 타이머 receiver 오류와 인자 없는 등록 `@call` 스키마 구성 오류.

독립 검토의 구체적 결함은 수정 후 [결합 회귀](../../packages/core/test/runtime-review-regression.test.mjs) 6개로 유지했다. 최종 재검토에서 지정 범위의 미해결 finding은 없다.

## CEL·지원 범위·후속 작업

[CEL 지원 문서](core-cel-support.md)와 배포물의 `dist/cel-support.json`이 지원 범위다. 기존 검증 패치를 보존하고 checked AST 캐시 문제의 별도 production 수정 패치를 추가했다. 설치된 upstream, 원래 patch 적용 결과, production 결과의 SHA-256을 확인해 빌드한다. 전체 CEL 표준 또는 임의 호스트 함수 sandbox를 제공한다고 주장하지 않는다.

후속 범위는 Svelte 제품 렌더러, Dart core/Flutter 및 선택 차트 패키지다. 기존 Dart CEL 후보의 7/22 불일치는 해결한 것으로 보고하지 않는다. 실제 서비스 resolver·권한 정책·secret 저장소·router 구현, 다른 브라우저, 운영 부하/성능은 이번 로컬 검증에 포함하지 않는다. CI workflow는 저장소에 추가했으며 원격 CI 실행·공개 배포는 하지 않았다. 라이선스·npm scope 소유·출시는 별도 운영 결정이다.

## 재현 명령

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:browser
npm run test:package
```

Node 22.21.1과 24.1.0에서 동일한 명령을 사용한다. 루트 lockfile과 vendored hash manifest가 재현 입력이다. 실험 디렉터리의 node_modules나 비공개 context-archive가 없어도 패키지와 제품 검증을 실행할 수 있다.
