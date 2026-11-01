# T3 TypeScript 계약 컴파일 fixture

현재 [최소 SDK](../../../docs/spec/07-host-integration.md), State/Query 관찰·핸들, native `{inputs, signal, invokeAction}`, schema/typeRef·참조/인라인 배타성을 **컴파일만 하는 독립 타입 제안**으로 표현했다. 공개 SDK 선언 확정·발행이나 기존 `.mjs` 런타임과의 타입 연결이 아니다. `contracts.ts`에는 타입/interface와 `declare`만 있고 실행 구현이 없으며 모든 컴파일은 `--noEmit --strict`로 수행한다.

```sh
cd experiments/t3-application/types
npm ci --ignore-scripts --no-audit --no-fund
/Users/minholim/.nvm/versions/node/v22.21.1/bin/node run.mjs
/opt/homebrew/opt/node@24/bin/node run.mjs
```

TypeScript **5.9.3**은 `npm view typescript@5.9.3 version dist.integrity --json`으로 실제 버전·integrity를 확인한 뒤 `--ignore-scripts`로 설치했다. 정확 버전과 `package-lock.json`으로 고정했으며 runner는 설치 metadata와 실제 `tsc --version`이 모두 5.9.3인지 검사한다.

Node **22.21.1·24.19.0** 두 환경에서 다음 네 단계가 모두 통과했다. 같은 타입 파일과 컴파일러를 두 지원 호스트에서 실행한 결과이며, 두 결과를 별개 계약 수로 합산하지 않는다.

1. `positive.ts`: 실제 등록·mount/update/replace·State 쓰기/읽기·Query refresh/retry·native callback 호출 모양이 strict 컴파일된다. 정상 동기/비동기 void, boolean/false·nullable output, readonly 데이터 읽기와 명시 State/Query 핸들 사용을 포함한다.
2. `negative.ts`: **56개** `@ts-expect-error`가 모두 소비된다. 사용하지 않은 directive는 0개다. 각 잘못된 사용은 독립된 한 줄이며 앞의 잘못된 값을 다른 예제에서 재사용하지 않는다.
3. 같은 negative 파일에서 directive만 제거한 별도 프로그램은 컴파일 실패하고, **56/56 해당 원문 줄**에서 진단이 검출된다. 예상 밖 파일/줄의 진단은 0개다. 주석으로 전체 프로그램의 실패를 숨기는 방식과 구별한다.
4. `runtime-limits.ts`: 타입만으로 거절하지 못하는 별도 예제가 예상대로 컴파일된다. 이는 유효한 제품 입력이라는 증거가 아니라 런타임 검증이 필요한 경계를 실행 확인한 것이다.

결과는 [Node 22](results/node22.json), [Node 24](results/node24.json)에 있다. 실제 CLI 명령·버전, case별 소스 줄/오류 코드, 소스 SHA-256, lockfile SHA-256·패키지 integrity, 실행한 컴파일러 파일 hash를 기록한다. 임시 unmasked 소스/config는 이 폴더에만 만들고 종료 때 제거한다. 기존 application 소스/결과는 바꾸지 않는다.

컴파일에서 검사한 내용:

- 등록 호출 안의 중첩 포트·이벤트·State/output에서 schema/typeRef XOR와 필수 타입 계약.
- Action/Query/Component/View의 ref/inline XOR, 필수 registry/owner, Store의 **타입 수준 private brand**.
- native Value 입력의 재귀 readonly 객체/배열/Map/Set, State/Query 핸들의 명시 메서드, `/event`·전체 Store/runtime의 암묵 접근 거절.
- native void 선언의 output 금지와 직접 반환 데이터 거절, typed output의 필수 계약·결과 타입, native output.value 금지와 선언형 output.value 필수.
- State의 missing 가능한 읽기와 snapshot narrowing, root undefined 쓰기 거절, Query 데이터·Action 관찰·initial 보고의 readonly 표면.

한계는 다음과 같다.

- 임의 JSON Schema의 의미·동등성/호환성, `typeRef` 존재, 수동 generic과 schema의 일치, 표현식 의미, 같은 ID 중복·권한·수명·취소는 런타임 검사다. 이 fixture는 Schema에서 TypeScript 타입을 자동 추론하지 않는다.
- `number`는 유한성·안전 정수·범위를 보장하지 않는다. NaN/Infinity/안전 범위 초과도 정적 타입은 number다.
- `void | Promise<void>` 표면은 직접 값/Promise 값을 반환하는 잘못된 callback을 거절한다. 하지만 이미 `() => void`로 타입이 지워진 함수의 실제 반환값까지 복원하지 못하므로 실제 undefined/void 검사는 여전히 필요하다.
- private `unique symbol` brand는 컴파일 fixture의 구조적 위조 거절이지 실제 라이브러리 Store brand 구현/인증이 아니다. `any`·타입 단언·외부 JSON/JS는 타입 검사를 우회할 수 있으므로 런타임 검증이 필요하다.
- 동적 `runtime.invokeAction` 결과는 등록 정보가 정적으로 연결되지 않아 `unknown`이다. callback 등록의 typed result 검사를 동적 참조의 결과 타입 추론 완료로 확대하지 않는다.
- update/replace는 `{initial}`을 `await`해서 사용하는 형태를 검사한다. 이 타입 fixture는 그 객체의 동기/Promise 반환 방식을 새 제품 계약으로 고정하지 않는다. 리소스/단계/HTTP 정의는 최소 부분집합이며 완전한 선언 문법·렌더러 타입을 제공하지 않는다.
- U35의 문맥 invokeAction도 ref/inline XOR·owner/id 금지·readonly·unknown 반환을 검사한다. 실제 부모 취소·재귀·권한은 컴파일로 증명할 수 없으며 Action 실험에서 검증한다.
