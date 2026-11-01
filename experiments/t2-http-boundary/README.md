# T2 HTTP 경계·수명 검증

U19에서 실제 Node/Chromium의 Host 처리 차이를 발견했고 U20에서 공통 헤더 거절을 반영했다. U21(2026-10-30)에서 API 응답 내용은 API 책임으로 정정한 뒤 검증을 재개했다. U22에서 auth.token 문맥을 수정·검증했다. U23에서 오류 정제도 보완했고 Node/Chromium의 전송 대조를 통과했다. U24에서 CEL 크기 계산을 확인하고 배열 경로도 수정·검증했다. U25에서 params 객체의 병합 전 검사를 보완·검증했다. U26에서 headers 객체 전체 @path를 지원하고 금지 헤더 검사도 유지·검증했다. U27에서 request.path를 평가하고 기존 주소·목적지 검사도 유지·검증했다. U28에서 baseUrl·method·Login request 전체와 공통 평가기를 보완하고 현재 HTTP/Login의 동적 위치 17곳을 모두 점검했다. **현재 검사 범위는 모두 통과했다.** core 본 구현·CEL 패치·실제 서비스 인증 구현이 아니다.

## 실행

Node 22 이상과 인접 URL 실험의 Playwright 1.62.1/Chromium이 필요하다. 이미 설치돼 있다면 설치를 반복하지 않는다.

```sh
cd experiments/t2-url-races
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
cd ../t2-http-boundary
npm test
node http-tests.mjs http-node24.json
node transport-tests.mjs transport-node24.json
node path-audit-tests.mjs path-audit-node24.json
node path-audit-mutations.mjs
```

Node 22 재현은 같은 명령의 node를 해당 바이너리로 바꾸고 결과명의 `node24`를 `node22`로 바꾼다. 고의 결함 검사는 Node 24에서 수행했다. 헤더 명령은 `node header-tests.mjs headers-node22.json`이다. 실제 기록 버전은 Node 22.21.1·24.19.0, Chromium 151.0.7922.34, Playwright 1.62.1, macOS arm64다.

- `npm test`: Node HTTP와 실제 Chromium fetch 각각 63개, 합계 **126/126 통과**. 각 Node 버전에서 별도로 실행했다. 금지/잘못된 선언 120건은 전송 0건, 허용 선언 6건은 실제 수신을 확인했다.
- `node http-tests.mjs`: Node fetch + 실제 loopback HTTP + 제어 가능한 clock. **261/261 통과**. P71의 baseUrl 참조도 수정·통과했다. P30–P70의 토큰 문맥·오류 정제·배열 경로·params·동적 headers/path 검사는 통과했다. P21은 U21의 책임 정정에 맞게 API 응답 전달을 확인하며 통과한다.
- `node transport-tests.mjs`: 공유 실행기의 Node fetch/실제 Chromium 대조 **174/174 통과**(Node 87 + Chromium 87). 각 Node 버전에서 실행했으며 HTTP 메서드·본문/응답·redirect·native timeout·동적 값 전송을 검사했다.
- `node path-audit-tests.mjs`: 17개 위치와 공통 문법/경로/문맥의 **304/304 통과**(Node 152 + 실제 Chromium 152). 양쪽 transport는 합성이며, 실제 전송 증거는 위 검사다. 첫 실패에서도 전체 사례를 계속 실행한다.
- `node path-audit-mutations.mjs`: 격리한 임시 복사본에서 고의 결함 **6/6 탐지**. 원본 소스는 바꾸지 않고 자체 임시 폴더만 정리한다.
- `npm run probe:raw`: U19의 guard 없는 원본 Host 재현. Chromium Host 사례에서 종료 코드 1이 정상적인 재현 결과다. 수정된 guard의 테스트와 별개다.

모든 네트워크는 127.0.0.1 임시 서버에 한정한다. 사용자 브라우저 프로필·실제 서비스·실제 credential은 사용하지 않는다. 서버·브라우저·요청을 종료하며, timeout 실험은 고정 sleep 대신 clock과 서버 응답 gate로 제어한다.

## 파일·증거

| 파일 | 역할 |
|---|---|
| [header-profile.mjs](header-profile.mjs) | 공통 헤더 이름/값 검사·병합 프로토타입 |
| [header-tests.mjs](header-tests.mjs) | Node/Chromium 실제 수신·전송 전 거절 검사 |
| [http-probe.mjs](http-probe.mjs) | Login·secret resolver·timeout·취소의 독립 실행기 |
| [value-expressions.mjs](value-expressions.mjs) | HTTP 값 표현식·Pointer·재귀/escape·기본 함수·문맥 검사 |
| [path-audit-cases.mjs](path-audit-cases.mjs), [path-audit-tests.mjs](path-audit-tests.mjs) | 17개 위치와 공통 계약의 Node/Chromium 공유 검사 |
| [path-audit-node22.json](results/path-audit-node22.json), [path-audit-node24.json](results/path-audit-node24.json) | 각각 304/304, 적용 위치·관찰 결과·소스 해시 |
| [path-audit-mutations.mjs](path-audit-mutations.mjs), [path-mutations-node24.json](results/path-mutations-node24.json) | 고의 결함 6/6 탐지와 증거 사례 |
| [http-tests.mjs](http-tests.mjs) | 실제 HTTP와 제어 clock의 순차 검증, 첫 실패에서 종료 |
| [headers-node22.json](results/headers-node22.json), [headers-node24.json](results/headers-node24.json) | 헤더 검증 결과·환경·현재 입력 소스 해시 |
| [http-node22.json](results/http-node22.json), [http-node24.json](results/http-node24.json) | 현재 HTTP 261/261·P71 포함 수정·현재 입력 소스 해시 |
| [U20 대체된 기대값](archive/u20-response-oracle/README.md) | 당시 P21의 실패 결과와 소스·정정 이유; 현재 결함으로 사용하지 않음 |
| [U21 수정 전 문맥 실패](archive/u21-token-context/README.md) | 당시 P30의 45/46 결과와 소스; 현재는 수정·통과 |
| [U22 수정 전 오류 정제 실패](archive/u22-error-sanitization/README.md) | 당시 P35의 67/68 결과와 소스; 현재는 수정·통과 |
| [U23 수정 전 배열 경로 실패](archive/u23-array-pointer/README.md) | 당시 P41의 87/88 결과와 소스·62/62 전송 대조; 현재는 경로 수정·통과 |
| [U24 수정 전 params 실패](archive/u24-params-container/README.md) | 당시 P46의 110/111 결과와 소스·72/72 전송 대조; 현재는 수정·통과 |
| [U25 수정 전 headers 참조 실패](archive/u25-header-object/README.md) | 당시 P51의 145/146 결과와 소스·88/88 전송 대조; 현재는 수정·통과 |
| [U26 수정 전 request.path 실패](archive/u26-request-path/README.md) | 당시 P61의 226/227 결과와 소스·122/122 전송 대조; 현재는 수정·통과 |
| [U27 수정 전 baseUrl 실패](archive/u27-base-url/README.md) | 당시 P71의 260/261 결과와 소스·146/146 전송 대조; 현재는 수정·통과 |
| [transport-tests.mjs](transport-tests.mjs) | 공유 실행기를 Node/Chromium에서 실행하는 실제 전송 검사 |
| [transport-node22.json](results/transport-node22.json), [transport-node24.json](results/transport-node24.json) | 각각 174/174, 실제 환경·소스 해시·요청 수 |
| [host-header-failure.json](results/host-header-failure.json) | U19 원본 Host 실패의 고정 보존본 |
| [run.mjs](run.mjs), [u19-package.json](results/u19-package.json) | U19 실행 소스와 당시 package.json 보존본 |

원본 실패의 `package.json` 해시는 `results/u19-package.json`에 대응한다. 원본 `run.mjs` 내용은 유지한다. `results/latest.json`은 원본 probe 재실행 출력이므로 고정 근거는 `host-header-failure.json`을 사용한다. 실험 사례의 H/P 번호는 문서 인수 행렬의 같은 번호와 별개다.

헤더 실험의 서버는 `rawHeaders`로 수신 필드를 읽고 Playwright 경계는 JSON 문자열로 넘긴다. Node의 편의 headers 객체와 Playwright 객체 직렬화가 `__proto__` 키를 누락시키는 측정 오류를 실제 전송 누락으로 판정하지 않도록 한 fixture 처리다.

## 책임 정정과 수정 이력

P21의 API 응답 반사는 API의 책임이다. U21에서 기본 응답 문자열 검사/마스킹/거절을 요구하던 기대값을 정정했고, 실행기의 응답 전달 코드는 바꾸지 않았다. API가 명시한 body/headers 보존과 실행기 내부 정보의 혼입 방지를 각각 검사한다. 이전 소스·32/33 결과는 위 archive에 보존했다.

U21의 `P30-token-extraction-cannot-read-secrets`는 U22에서 수정했다. 요청 평가에만 실제 목적지와 secret 해석 권한을 전달하고 auth.token에는 Login 응답만 제공한다. 중첩 함수·잘못된 Pointer·정상 응답 추출을 포함한 60개 검사를 두 Node 버전에서 통과했다.

U22의 P35 오류 정제 실패는 U23에서 수정했다. getter·상속·강제 변환에 의존하지 않고, 속성 검사 자체가 실패해도 고정 HTTP_ERROR로 처리한다. 추가 회귀를 포함해 Node 22/24 각각 80/80 통과 후 실제 브라우저 전송 대조도 각각 62/62 통과했다. http-*.json의 notRun은 그 검사 단독 범위이며 브라우저 전송 결과는 transport-*.json에 별도로 있다.

U23의 P41 배열 length 문제는 U24에서 수정했다. 배열 경로는 정규 정수 인덱스와 실제 원소만 허용하며 일반 객체의 length 필드는 유지한다. CEL에서 크기를 계산하는 [독립 검사](../t1-values/array-size-tests.mjs)는 Node 22/24 각각 18/18 통과했다. 배열 경로 회귀를 포함한 HTTP 107/107, 실제 Node/Chromium 전송 대조 72/72도 통과했다.

U24의 P46은 U25에서 수정했다. 각 params 선언이 일반 객체인지 병합 전에 검사한다. 배열/null/스칼라/native 컬렉션은 거절하고 요청 우선·키 제거·반복 배열 값은 유지했다. Node 22/24 각각 HTTP 142/142, Node/Chromium 전송 대조 88/88을 통과했다.

U25의 P51은 U26에서 수정했다. 전체 @path를 정적 이름과 구분하고 참조 결과도 일반 객체·이름/값·금지/중복 검사를 거친 뒤 병합한다. null 제거와 반환 데이터 비재실행을 유지하며 정적 금지 이름은 Login 전에 차단한다. Node 22/24 각각 HTTP 226/226, Node/Chromium 전송 대조 122/122를 통과했다.

U26의 P61은 U27에서 수정했다. path 평가 후 기존 주소 문법·공통 경로·목적지 권한 검사를 거친다. 주소 확정 전에는 secret resolver를 제공하지 않고 승인된 목적지를 요청 구성용 resolver에 전달하며 최종 query URL도 재검사한다. Node 22/24 각각 HTTP 260/260, Node/Chromium 전송 대조 146/146을 통과했다.

U27의 P71은 U28에서 수정했다. baseUrl·method·Login request 전체 평가와 공통 표현식의 형태·@@ escape·formatString·경로 오류 구분을 보완했다. 기존 주소/권한/헤더/취소 검사와 반환 데이터 비재실행을 유지한다. [17개 위치 전체 점검과 남은 범위](../../docs/handoff/t2-path-audit-2026-10-30.md)에 근거를 기록했다. 기존 계약 위반은 추가 질문 없이 수정·검증하고 실제 선택이 필요한 경우만 논의한다.

## 후속 Query 연결

U29의 [별도 Query–HTTP 연결 실험](../t2-query-http/README.md)은 현재 HTTP 실행기를 기존 Query 스케줄러에 연결한다. Node 22/24 각각 39개 사례·4개 고의 결함을 확인했다. 이 폴더의 소스를 바꾸지 않고 실제 Login/본문 지연·timeout·취소가 Query의 fresh 대기·입력 세대·마지막 성공 보존과 함께 동작함을 검사했다.
