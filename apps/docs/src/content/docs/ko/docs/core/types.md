---
title: 공개 API·타입 색인
description: 패키지의 실제 export를 기준으로 API와 타입의 상세 설명을 찾습니다.
sidebar:
  order: 18
---

패키지의 실제 export를 기준으로 API와 타입의 상세 설명을 찾습니다.

## 공유 값 타입

```ts
type Awaitable<T> = T | PromiseLike<T>;
type JsonValue = null | boolean | number | string
  | readonly JsonValue[] | { readonly [key: string]: JsonValue };
```

`JsonValue`는 직렬화 가능한 정의·전송 값의 타입입니다. 호스트 입력에서 지원하는 네이티브 Set/Map이나 발급된 State/Query 핸들까지 JSON이라고 부르지는 않습니다. `DeepReadonly<T>`는 객체·배열·Set/Map 내부를 읽기 전용으로 표현하되 State/Query 핸들의 호출 기능은 유지합니다. `Awaitable<T>`는 T 또는 PromiseLike<T>이며 API마다 실제 비동기 허용 여부를 확인하세요. StateStore.transaction과 CEL 콜백에는 비동기를 허용하지 않습니다.

## @viewstem/core

| 공개 이름 | 상세 레퍼런스 |
|---|---|
| <a id="awaitable"></a>`Awaitable` | [types](#공유-값-타입) |
| <a id="jsonvalue"></a>`JsonValue` | [types](#공유-값-타입) |
| <a id="schema"></a>`Schema` | [types](/ko/docs/dsl/types/) |
| <a id="typecontract"></a>`TypeContract` | [types](/ko/docs/dsl/types/) |
| <a id="resourcekind"></a>`ResourceKind` | [resources](/ko/docs/dsl/resources/) |
| <a id="resource"></a>`Resource` | [resources](/ko/docs/dsl/resources/) |
| <a id="publicerror"></a>`PublicError` | [runtime](/ko/docs/core/runtime/) |
| <a id="deepreadonly"></a>`DeepReadonly` | [types](#공유-값-타입) |
| <a id="valuesnapshot"></a>`ValueSnapshot` | [state-store](/ko/docs/core/state-store/) |
| <a id="stateaddress"></a>`StateAddress` | [state-store](/ko/docs/core/state-store/) |
| <a id="statehandle"></a>`StateHandle` | [state-store](/ko/docs/core/state-store/) |
| <a id="querysnapshot"></a>`QuerySnapshot` | [view](/ko/docs/core/view/) |
| <a id="queryhandle"></a>`QueryHandle` | [view](/ko/docs/core/view/) |
| <a id="statedeclaration"></a>`StateDeclaration` | [state-store](/ko/docs/core/state-store/) |
| <a id="statescope"></a>`StateScope` | [state-store](/ko/docs/core/state-store/) |
| <a id="storeobservation"></a>`StoreObservation` | [state-store](/ko/docs/core/state-store/) |
| <a id="urladapter"></a>`UrlAdapter` | [url](/ko/docs/core/url/) |
| <a id="urlconnection"></a>`UrlConnection` | [url](/ko/docs/core/url/) |
| <a id="statestore"></a>`StateStore` | [state-store](/ko/docs/core/state-store/) |
| <a id="createstatestore"></a>`createStateStore` | [state-store](/ko/docs/core/state-store/) |
| <a id="clock"></a>`Clock` | [state-store](/ko/docs/core/state-store/) |
| <a id="timerclock"></a>`TimerClock` | [runtime](/ko/docs/core/runtime/) |
| <a id="valueport"></a>`ValuePort` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="stateport"></a>`StatePort` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="queryport"></a>`QueryPort` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="port"></a>`Port` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="childactionrequest"></a>`ChildActionRequest` | [registry](/ko/docs/core/registry/) |
| <a id="actioncontext"></a>`ActionContext` | [registry](/ko/docs/core/registry/) |
| <a id="actionhandler"></a>`ActionHandler` | [registry](/ko/docs/core/registry/) |
| <a id="codeactionspec"></a>`CodeActionSpec` | [registry](/ko/docs/core/registry/) |
| <a id="codeactiondefinition"></a>`CodeActionDefinition` | [registry](/ko/docs/core/registry/) |
| <a id="actionsnapshot"></a>`ActionSnapshot` | [view](/ko/docs/core/view/) |
| <a id="valueexpression"></a>`ValueExpression` | [values](/ko/docs/dsl/values/) |
| <a id="inputexpressions"></a>`InputExpressions` | [values](/ko/docs/dsl/values/) |
| <a id="pathexpression"></a>`PathExpression` | [values](/ko/docs/dsl/values/) |
| <a id="actionspec"></a>`ActionSpec` | [actions](/ko/docs/dsl/actions/) |
| <a id="actioncall"></a>`ActionCall` | [actions](/ko/docs/dsl/actions/) |
| <a id="step"></a>`Step` | [actions](/ko/docs/dsl/actions/) |
| <a id="httprequest"></a>`HttpRequest` | [datasources](/ko/docs/dsl/datasources/) |
| <a id="datasourcespec"></a>`DatasourceSpec` | [datasources](/ko/docs/dsl/datasources/) |
| <a id="querysource"></a>`QuerySource` | [queries](/ko/docs/dsl/queries/) |
| <a id="transformstep"></a>`TransformStep` | [queries](/ko/docs/dsl/queries/) |
| <a id="queryspec"></a>`QuerySpec` | [queries](/ko/docs/dsl/queries/) |
| <a id="variablespec"></a>`VariableSpec` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="queryuse"></a>`QueryUse` | [queries](/ko/docs/dsl/queries/) |
| <a id="querydefaults"></a>`QueryDefaults` | [queries](/ko/docs/dsl/queries/) |
| <a id="resourcestatedeclaration"></a>`ResourceStateDeclaration` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="reaction"></a>`Reaction` | [state-and-ports](/ko/docs/dsl/state-and-ports/) |
| <a id="componentpubliccontract"></a>`ComponentPublicContract` | [view-and-component](/ko/docs/dsl/view-and-component/) |
| <a id="componentcontract"></a>`ComponentContract` | [registry](/ko/docs/core/registry/) |
| <a id="componentspec"></a>`ComponentSpec` | [view-and-component](/ko/docs/dsl/view-and-component/) |
| <a id="viewspec"></a>`ViewSpec` | [view-and-component](/ko/docs/dsl/view-and-component/) |
| <a id="componentnode"></a>`ComponentNode` | [view-and-component](/ko/docs/dsl/view-and-component/) |
| <a id="resourcespecs"></a>`ResourceSpecs` | [resources](/ko/docs/dsl/resources/) |
| <a id="anyresource"></a>`AnyResource` | [resources](/ko/docs/dsl/resources/) |
| <a id="registeredresource"></a>`RegisteredResource` | [resources](/ko/docs/dsl/resources/) |
| <a id="registry"></a>`Registry` | [registry](/ko/docs/core/registry/) |
| <a id="registryoptions"></a>`RegistryOptions` | [registry](/ko/docs/core/registry/) |
| <a id="createregistry"></a>`createRegistry` | [registry](/ko/docs/core/registry/) |
| <a id="viewsource"></a>`ViewSource` | [runtime](/ko/docs/core/runtime/) |
| <a id="runtime-settings"></a>`RuntimeSettings` | [runtime](/ko/docs/core/runtime/) |
| <a id="actionrequest"></a>`ActionRequest` | [runtime](/ko/docs/core/runtime/) |
| <a id="viewoptions"></a>`ViewOptions` | [runtime](/ko/docs/core/runtime/) |
| <a id="initialreport"></a>`InitialReport` | [runtime](/ko/docs/core/runtime/) |
| <a id="viewapplication"></a>`ViewApplication` | [runtime](/ko/docs/core/runtime/) |
| <a id="nodesnapshot"></a>`NodeSnapshot` | [view](/ko/docs/core/view/) |
| <a id="viewsnapshot"></a>`ViewSnapshot` | [view](/ko/docs/core/view/) |
| <a id="runtimeoptions"></a>`RuntimeOptions` | [runtime](/ko/docs/core/runtime/) |
| <a id="runtime"></a>`Runtime` | [runtime](/ko/docs/core/runtime/) |
| <a id="createruntime"></a>`createRuntime` | [runtime](/ko/docs/core/runtime/) |
| <a id="view"></a>`View` | [view](/ko/docs/core/view/) |
| <a id="celvalue"></a>`CelValue` | [cel](/ko/docs/core/cel/) |
| <a id="celfunction"></a>`CelFunction` | [cel](/ko/docs/core/cel/) |
| <a id="httpexecutionplan"></a>`HttpExecutionPlan` | [http](/ko/docs/core/http/) |
| <a id="httpresponse"></a>`HttpResponse` | [http](/ko/docs/core/http/) |
| <a id="requestexecutor"></a>`RequestExecutor` | [http](/ko/docs/core/http/) |
| <a id="mergeownedurl"></a>`mergeOwnedUrl` | [url](/ko/docs/core/url/) |
| <a id="gridconfig"></a>`GridConfig` | [utilities](/ko/docs/core/utilities/) |
| <a id="gridplacement"></a>`GridPlacement` | [utilities](/ko/docs/core/utilities/) |
| <a id="computegridlayout"></a>`computeGridLayout` | [utilities](/ko/docs/core/utilities/) |

## @viewstem/core/http

| 공개 이름 | 상세 레퍼런스 |
|---|---|
| `HttpExecutionPlan` | [http](/ko/docs/core/http/) |
| `HttpResponse` | [http](/ko/docs/core/http/) |
| `RequestExecutor` | [http](/ko/docs/core/http/) |
| <a id="httpexecutoroptions"></a>`HttpExecutorOptions` | [http](/ko/docs/core/http/) |
| <a id="createhttpexecutor"></a>`createHttpExecutor` | [http](/ko/docs/core/http/) |

## @viewstem/core/cel

| 공개 이름 | 상세 레퍼런스 |
|---|---|
| `CelFunction` | [cel](/ko/docs/core/cel/) |
| `CelValue` | [cel](/ko/docs/core/cel/) |
| <a id="cellimits"></a>`CelLimits` | [cel](/ko/docs/core/cel/) |
| <a id="defaultcellimits"></a>`defaultCelLimits` | [cel](/ko/docs/core/cel/) |
| <a id="celoptions"></a>`CelOptions` | [cel](/ko/docs/core/cel/) |
| <a id="compilecel"></a>`compileCel` | [cel](/ko/docs/core/cel/) |
| <a id="evaluatecel"></a>`evaluateCel` | [cel](/ko/docs/core/cel/) |

## @viewstem/core/cel-support.json

지원하는 CEL 기능과 시그니처의 JSON 자산입니다. 함수가 아니며 [CEL 레퍼런스](../cel/)에서 지원 범위와 제한을 설명합니다.

외부 타입은 `import type`으로 가져오세요. index는 현재 공개 경계만 다루며 내부 Registry/Runtime 클래스나 private helper를 공개 API로 취급하지 않습니다.
