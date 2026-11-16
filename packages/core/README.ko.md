# @viewstem/core

[English](README.md) | 한국어

Viewstem은 [MIT 라이선스](LICENSE)로 배포합니다. 함께 배포하는 CEL 코드의 저작자 표시와 라이선스는 [THIRD-PARTY-NOTICES.txt](dist/THIRD-PARTY-NOTICES.txt)에 포함합니다.

선언형 UI의 검증·값·상태·Query·Action·화면 수명을 실행하는 ESM 라이브러리입니다. DOM, Svelte, 회사 도메인에 의존하지 않습니다.

```ts
import { createRegistry, createRuntime } from '@viewstem/core';

const registry = createRegistry();
registry.registerComponentContract({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
const runtime = createRuntime({ registry });
const view = await runtime.createView({
  states: { title: { kind: 'State', schema: { type: 'string' }, initial: 'Hello' } },
  render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/title' } } },
});
await view.whenSettled(view.initial);
const stop = view.subscribe(snapshot => {
  console.log(snapshot.roots[0]?.inputs.text);
});
view.getState('title').write('Updated');
stop();
runtime.dispose();
```

`view.whenSettled(application)`은 이번 적용에서 실행 가능한 첫 Query들의 성공/오류가 확정된 완료 신호입니다. UI는 준비된 부분부터 관찰할 수 있습니다. 입력 미준비·gate 차단은 완료를 막지 않으며 Query 오류는 `(await view.whenSettled(view.initial)).queryErrors`에 포함됩니다. DOM paint 완료 신호는 아닙니다.

## API 경계

- `createRegistry`: `(kind, id)` 등록·검증, 코드형 Component/Action 등록, 목록·설명·정의 추출·명시적 정의 교체.
- `createStateStore`: scope, State, `writeBatch`/동기 `transaction`, 안정적인 읽기 snapshot, `registerReaction`, Clock·URL 연결. Derived는 View/Component의 `states`에 선언합니다. 외부에서 주입한 Store는 runtime 폐기로 제거하지 않습니다.
- `createRuntime()`은 기본 Registry를 생성합니다. Runtime은 `createView(source, options?)`, `registry`, `stateStore`, `dispose`를 제공합니다. View는 `setInputs`, `updateDefinition`, `replace`, `invokeAction`, `whenSettled`, `emit`, `getSnapshot`, `subscribe`, `getState`, `getQuery`, `exportDefinition`을 제공합니다.
- `mergeOwnedUrl`: 호스트 URL adapter에서 소유 키만 병합합니다.
- `computeGridLayout`: 12열 배치 계산만 제공하며 Grid UI를 자동 등록하지 않습니다.

루트의 실행 export는 위 다섯 개입니다. 선택 실행기는 별도 진입점에서 가져옵니다.

```ts
import { createHttpExecutor } from '@viewstem/core/http';
import { compileCel, evaluateCel, defaultCelLimits } from '@viewstem/core/cel';
```

`Registry`, `StateStore`, `Runtime`, `View`는 생성자가 아닌 타입입니다. 팩토리가 반환하는 객체에는 공개 메서드만 있으며 내부 엔진·검증기·초기화 메서드를 노출하지 않습니다. `@path`/`@call`, Query, Variable은 리소스 선언을 통해 실행합니다. 기존 생성자·엔진 export를 사용했다면 같은 revision의 [API 변경 안내](../../docs/handoff/public-api-refactor-2026-11-02.md)를 따릅니다.

정확한 타입·필드는 패키지의 `dist/index.d.ts`, `dist/http.d.ts`, `dist/cel.d.ts`를 따릅니다. Registry/Store/View 및 State/Query 핸들은 라이브러리가 발급한 객체입니다. JSON 값으로 직렬화하거나 일반 객체로 모사하지 않습니다. Value는 원본을 격리하고 읽기 전용으로 전달합니다. Set/Map은 native 정체성·동등성 계약을 유지하며 HTTP 계획 입력에서만 배열/엔트리 쌍으로 변환합니다.

## 호스트 연결

렌더러는 `view.getSnapshot()` 또는 `subscribe()`의 `roots`를 그립니다. 각 노드는 `instanceId`, `generation`, `status`, `inputs`, `children`, 이름별 `slots`를 포함합니다. 이벤트는 선언된 payload만 `view.emit(node, event, payload)`로 전달합니다. DOM 이벤트 객체를 전달하지 않습니다. `when:false`/실제 제거는 수명을 끝내지만 일시적인 입력 대기는 기존 상태·실행 연결을 유지합니다.

기존 화면은 주입 시점의 리소스 정의를 유지합니다. `registry.updateResource`는 공용 정의를 변경하고 `view.replace`나 새 createView에서 이를 주입합니다. `view.updateDefinition`는 현재 화면 구성만 바꿉니다. 유지하는 셀의 State↔Derived 변경은 쓰기 계약 불일치로 거절합니다. State·현재 화면·공용 정의의 변경/추출은 DB 저장과 별개입니다.

코드 Action의 필수 입력은 포트에 `required: true`로 선언합니다. 기본값이 있는 Value 포트도 연결된 값이 없을 수 있으므로 핸들러에서는 선택 입력입니다. `updateResource`는 참조 Type을 포함한 코드 Action의 입출력 계약을 보존합니다. 계약을 바꿀 때는 새 Action ID로 핸들러를 함께 등록하고 호출 위치의 참조를 옮깁니다.

View가 투영을 계산하거나 발행하는 중 구독자가 State를 쓰면, runtime은 후속 투영을 예약합니다. 현재의 불변 snapshot 통지를 마친 뒤 새 투영을 발행하며, 그동안 발생한 여러 쓰기는 한 번의 후속 투영으로 합칩니다. 같은 값을 다시 쓰면 새 State 변경을 만들지 않습니다. 변경된 노드 입력은 다음 snapshot에서 확인하고 DOM 반영은 렌더러의 완료 수단으로 확인합니다.

`authorize({operation, owner, definition})`는 Action 실행과 `view.updateDefinition`/기존 화면 `replace`의 변경 권한을 검사합니다. 반환값이 `true`일 때만 허용합니다. 목록 노출 필터, 사용자 신원, 저장 권한은 호스트가 구성합니다. 목록에서 발견했다는 사실이 실행 권한을 주지 않습니다.

`update`의 owner는 createView가 반환한 공개 View와 같은 객체입니다. `invoke`의 owner는 수명별 비교에만 쓰는 불투명 식별 객체이며 실행 메서드가 없습니다. 권한 콜백에는 등록된 코드 Action의 구현 함수를 전달하지 않습니다.

등록 코드 Action의 `context.invokeAction`은 부모 취소·재귀 스택을 상속합니다. 부모 종료 시 미완료 하위 호출도 취소됩니다. `view.invokeAction(request)`은 해당 View 소유의 독립 실행입니다. 취소된 호출의 State 쓰기·Query refresh는 거절하며 이미 성공한 효과는 되돌리지 않습니다.

## HTTP와 URL

`requestExecutor(plan, {signal})`을 주입하지 않으면 native fetch 기반 공개 HTTP를 사용합니다. secret이나 Login이 필요한 계획은 신뢰하는 서버에서 `createHttpExecutor({authorize,resolveSecret,caller})`로 실행합니다. 브라우저에 secret resolver를 넣지 않습니다. 주소 권한·헤더·파라미터·응답 파싱·timeout은 매 요청에 적용합니다. 서비스의 실제 권한·저장소 구현은 패키지에 포함하지 않습니다.

URL adapter는 `read`, `subscribe`, `writeOwned(patch,{mode,isCurrent})`를 구현합니다. 비동기 준비 이후 **실제 URL 반영 직전**에 `isCurrent()`를 확인해야 합니다. `mergeOwnedUrl`은 정확히 소유한 키만 변경하고 다른 query 문자열의 원래 인코딩을 보존합니다. View 편의 연결은 `createView/replace`의 `url:{adapter,bindings:[{state,key?,history?}],limits?}`로 사용하며 Store의 직접 `connectUrl`과 동시에 연결할 수 없습니다. cleanup 실패는 새 화면 적용을 완료하고 오류를 기록합니다. 새 초기값이 늦게 준비돼도 남은 옛 URL로 덮지 않으며, 초기값 준비 중 명시한 State 쓰기는 준비 완료 후 URL에 반영합니다.

## CEL 지원 및 제한

`dist/cel-support.json`에 공개 지원 목록이 포함됩니다. upstream cel-js 8.0.0, 검증된 기존 패치와 production 수정 패치의 SHA-256을 확인해 빌드합니다. 정확한 시그니처는 배포물의 지원 목록을 따릅니다. 전체 CEL 적합성을 주장하지 않습니다. bytes, uint, type, optional, cel.bind 등은 미지원입니다. 날짜는 선언된 문자열/명시적 시간대 계약을 사용합니다. 일반 `number`는 CEL double, `integer`는 안전 정수입니다.

CEL AST·비용·결과 크기 제한은 `defaultCelLimits`로 확인할 수 있습니다. 등록 함수는 신뢰하는 호스트의 동기·순수 콜백이며 스키마 검증과 읽기 전용 입력을 적용합니다. 실행 시간 격리나 악성 호스트 콜백 sandbox는 제공하지 않습니다.

## 상세 계약과 문서 버전

패키지 안에서 확인할 정확한 API는 [기본 타입](dist/index.d.ts), [HTTP 타입](dist/http.d.ts), [CEL 타입](dist/cel.d.ts), 지원 함수 목록은 [CEL 지원 JSON](dist/cel-support.json)이다. 이 파일들은 빌드·tarball에 포함된다. 위 사용 예제는 이 공개 API를 설명한다.

다음 링크는 **같은 revision의 소스 저장소에서 읽는 문서**다. 상세 `docs/`는 tarball에 포함되지 않으며 설치 디렉터리를 기준으로 이 상대 링크를 해석하지 않는다.

- [전체 계약과 문서 지도](../../docs/README.ko.md): 리소스별 기준 명세와 검증 경로.
- [스키마 프로필](../../docs/spec/03-variable-type.md), [값·날짜·snapshot](../../docs/spec/10-value-contracts.md).
- [호스트·권한·초기 완료](../../docs/spec/07-host-integration.md), [Store·reaction·URL](../../docs/spec/09-preserved-contracts.md).
- [CEL 지원 의미·제한](../../docs/handoff/core-cel-support.md), [패치와 재현 빌드](vendor/README.md).
- [API 정리 이후 검증 결과](../../docs/handoff/public-api-verification-results.json), [초기 제품 검증 결과](../../docs/handoff/core-verification-results.json), [후속 범위](../../docs/handoff/open-contracts.md#실제-남은-작업).

발행된 tarball에는 해당 소스 커밋의 공개 문서 링크가 포함됩니다.

## 재현

저장소 루트에서:

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:browser
npm run test:package
```

Node 22.21.1·24.1.0 및 Playwright 1.62.1 Chromium으로 검증합니다. Svelte 앱 연결은 별도 [@viewstem/svelte](../svelte/README.ko.md)를 사용합니다. Dart/Flutter와 선택 차트는 후속 패키지 범위입니다. HTTP 실서비스 정책, 다른 브라우저 및 운영 성능은 이 검사로 보장하지 않습니다.

빌드는 세 진입점·필수 타입 선언·공통 모듈 chunk를 모두 준비한 뒤 `dist`를 교체하며 이전 빌드의 불필요한 파일을 남기지 않습니다. `npm run check`는 `skip`·`todo`를 통과로 집계하지 않고 실패 처리하며, 인수 대조에는 실제 실행 보고서가 필요합니다.

공개 이름 변경은 [U42 이행표](../../docs/handoff/public-api-naming-2026-11-02.md)를 따릅니다. `registerComponentContract`, `exportResource`, `writeBatch`, `registerReaction`, `getSnapshot`, `getDiagnostics`를 사용하며 이전 이름의 별칭은 제공하지 않습니다. JSON State 선언의 `initial`은 그대로입니다.
