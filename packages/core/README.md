# @viewstem/core

선언형 UI의 검증·값·상태·Query·Action·화면 수명을 실행하는 ESM 라이브러리입니다. DOM, Svelte, 회사 도메인에 의존하지 않습니다. 현재 버전은 저장소에서 빌드·설치 검증한 `0.1.0`이며 npm 발행을 뜻하지 않습니다.

```ts
import { createRegistry, createRuntime } from '@viewstem/core';

const registry = createRegistry();
registry.registerComponent({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
const runtime = createRuntime({ registry });
const { view, initial } = await runtime.mount({ view: {
  states: { title: { kind: 'State', schema: { type: 'string' }, initial: 'Hello' } },
  render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/title' } } },
} });
await initial;
const stop = view.subscribe(snapshot => {
  console.log(snapshot.roots[0]?.inputs.text);
});
view.getState('title').write('Updated');
stop();
runtime.dispose();
```

`initial`은 이번 적용에서 실행 가능한 첫 Query들의 성공/오류가 확정된 완료 신호입니다. UI는 준비된 부분부터 관찰할 수 있습니다. 입력 미준비·gate 차단은 완료를 막지 않으며 Query 오류는 `initial.queryErrors`에 포함됩니다. DOM paint 완료 신호는 아닙니다.

## API 경계

- `createRegistry`: `(kind, id)` 등록·검증, 코드형 Component/Action 등록, 목록·설명·정의 추출·명시적 정의 교체.
- `createStateStore`: scope, State/Derived, 원자적 batch/동기 transaction, 안정적인 읽기 snapshot, reaction, Clock·URL 연결. 외부에서 주입한 Store는 runtime 폐기로 제거하지 않습니다.
- `createRuntime`: `mount`, `invokeAction`, `listResources`, `describeResource`, `dispose`. `view`는 `update`, `replace`, `emit`, `snapshot`, `subscribe`, `getState`, `getQuery`, `exportDefinition`을 제공합니다.
- `compileCel`: 고정 패치 CEL과 스키마 기반 native 값 경계. `evaluate`는 `@path`/`@call` 값 표현식입니다.
- `createQueryEngine`: 직접 사용 가능한 Query 실행 및 사용 인스턴스. 화면 실행과 동일한 구현입니다.
- `createHttpExecutor`: 기본 공개 HTTP 또는 서버에서 주입하는 인증·secret 경계. `@viewstem/core/http`에서도 가져올 수 있습니다.
- `gridLayout`: 12열 배치 계산만 제공하며 Grid UI를 자동 등록하지 않습니다.

정확한 타입·필드는 패키지의 `dist/index.d.ts`, `dist/http.d.ts`를 따릅니다. State/Query 핸들은 런타임에서 발급한 capability입니다. JSON 값으로 직렬화하거나 일반 객체로 모사하지 않습니다. Value는 원본을 격리하고 읽기 전용으로 전달합니다. Set/Map은 native 정체성·동등성 계약을 유지하며 HTTP 계획 입력에서만 배열/엔트리 쌍으로 변환합니다.

## 호스트 연결

렌더러는 `view.snapshot()` 또는 `subscribe()`의 `roots`를 그립니다. 각 노드는 `instanceId`, `generation`, `status`, `inputs`, `children`, 이름별 `slots`를 포함합니다. 이벤트는 선언된 payload만 `view.emit(node, event, payload)`로 전달합니다. DOM 이벤트 객체를 전달하지 않습니다. `when:false`/실제 제거는 수명을 끝내지만 일시적인 입력 대기는 기존 상태·실행 연결을 유지합니다.

기존 화면은 주입 시점의 리소스 정의를 유지합니다. `registry.updateResource`는 공용 정의를 변경하고 `view.replace`나 새 mount에서 이를 주입합니다. `view.update`는 현재 화면 구성만 바꿉니다. 유지하는 셀의 State↔Derived 변경은 쓰기 계약 불일치로 거절합니다. State·현재 화면·공용 정의의 변경/추출은 DB 저장과 별개입니다.

`authorize({operation, owner, definition})`는 Action 실행과 `view.update`/기존 화면 `replace`의 변경 권한을 검사합니다. 반환값이 `true`일 때만 허용합니다. 목록 노출 필터, 사용자 신원, 저장 권한은 호스트가 구성합니다. 목록에서 발견했다는 사실이 실행 권한을 주지 않습니다.

등록 코드 Action의 `context.invokeAction`은 부모 취소·재귀 스택을 상속합니다. 부모 종료 시 미완료 하위 호출도 취소됩니다. `runtime.invokeAction({owner:view,...})`은 해당 View 소유의 독립 실행입니다. 취소된 호출의 State 쓰기·Query refresh는 거절하며 이미 성공한 효과는 되돌리지 않습니다.

## HTTP와 URL

`requestExecutor(plan, {signal})`을 주입하지 않으면 native fetch 기반 공개 HTTP를 사용합니다. secret이나 Login이 필요한 계획은 신뢰하는 서버에서 `createHttpExecutor({authorize,resolveSecret,caller})`로 실행합니다. 브라우저에 secret resolver를 넣지 않습니다. 주소 권한·헤더·파라미터·응답 파싱·timeout은 매 요청에 적용합니다. 서비스의 실제 권한·저장소 구현은 패키지에 포함하지 않습니다.

URL adapter는 `read`, `subscribe`, `writeOwned(patch,{mode,isCurrent})`를 구현합니다. 비동기 준비 이후 **실제 URL 반영 직전**에 `isCurrent()`를 확인해야 합니다. `mergeOwnedUrl`은 정확히 소유한 키만 변경하고 다른 query 문자열의 원래 인코딩을 보존합니다. View 편의 연결은 `mount/replace`의 `url:{adapter,bindings:[{state,key?,history?}],limits?}`로 사용하며 Store의 직접 `connectUrl`과 동시에 연결할 수 없습니다. cleanup 실패는 새 화면 적용을 완료하고 오류를 기록합니다. 새 초기값이 늦게 준비돼도 남은 옛 URL로 덮지 않으며, 초기값 준비 중 명시한 State 쓰기는 준비 완료 후 URL에 반영합니다.

## CEL 지원 및 제한

`dist/cel-support.json`에 공개 지원 목록이 포함됩니다. upstream cel-js 8.0.0, 검증된 기존 패치와 production 수정 패치의 SHA-256을 확인해 빌드합니다. 지원 범위는 71개 upstream 함수/연산자와 19개 native/calendar 시그니처입니다. 전체 CEL 적합성을 주장하지 않습니다. bytes, uint, type, optional, cel.bind 등은 미지원입니다. 날짜는 선언된 문자열/명시적 시간대 계약을 사용합니다. 일반 `number`는 CEL double, `integer`는 안전 정수입니다.

CEL AST·비용·결과 크기 제한은 `celLimits`로 확인할 수 있습니다. 등록 함수는 신뢰하는 호스트의 동기·순수 콜백이며 스키마 검증과 읽기 전용 입력을 적용합니다. 실행 시간 격리나 악성 호스트 콜백 sandbox는 제공하지 않습니다.

## 재현

저장소 루트에서:

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:browser
npm run test:package
```

Node 22.21.1·24.1.0 및 Playwright 1.62.1 Chromium으로 검증합니다. Svelte 렌더러, Dart/Flutter, 선택 차트는 후속 패키지 범위입니다. HTTP 실서비스 정책, 다른 브라우저 및 운영 성능은 이 검사로 보장하지 않습니다.

빌드는 필수 타입 선언을 포함한 8개 산출물을 모두 준비한 뒤 `dist`를 교체하며 이전 빌드의 불필요한 파일을 남기지 않습니다. `npm run check`는 `skip`·`todo`를 통과로 집계하지 않고 실패 처리하며, 인수 대조에는 실제 실행 보고서가 필요합니다.
