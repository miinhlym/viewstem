---
title: Public API and type index
description: Find the detailed contract for every actual package export.
sidebar:
  order: 18
---

Find the detailed contract for every actual package export.

## Shared value types

```ts
type Awaitable<T> = T | PromiseLike<T>;
type JsonValue = null | boolean | number | string
  | readonly JsonValue[] | { readonly [key: string]: JsonValue };
```

`JsonValue` describes serializable declarations and transport values. Host inputs can additionally support native Set/Map values and issued State/Query handles; these are not JSON. `DeepReadonly<T>` makes objects, arrays and Set/Map contents readonly while preserving State/Query handle capabilities. `Awaitable<T>` accepts a value or PromiseLike, but not every callback is asynchronous: StateStore.transaction and CEL callbacks are synchronous.

## @viewstem/core

| Public name | Detailed reference |
|---|---|
| <a id="awaitable"></a>`Awaitable` | [types](#shared-value-types) |
| <a id="jsonvalue"></a>`JsonValue` | [types](#shared-value-types) |
| <a id="schema"></a>`Schema` | [types](/docs/dsl/types/) |
| <a id="typecontract"></a>`TypeContract` | [types](/docs/dsl/types/) |
| <a id="resourcekind"></a>`ResourceKind` | [resources](/docs/dsl/resources/) |
| <a id="resource"></a>`Resource` | [resources](/docs/dsl/resources/) |
| <a id="publicerror"></a>`PublicError` | [runtime](/docs/core/runtime/) |
| <a id="deepreadonly"></a>`DeepReadonly` | [types](#shared-value-types) |
| <a id="valuesnapshot"></a>`ValueSnapshot` | [state-store](/docs/core/state-store/) |
| <a id="stateaddress"></a>`StateAddress` | [state-store](/docs/core/state-store/) |
| <a id="statehandle"></a>`StateHandle` | [state-store](/docs/core/state-store/) |
| <a id="querysnapshot"></a>`QuerySnapshot` | [view](/docs/core/view/) |
| <a id="queryhandle"></a>`QueryHandle` | [view](/docs/core/view/) |
| <a id="statedeclaration"></a>`StateDeclaration` | [state-store](/docs/core/state-store/) |
| <a id="statescope"></a>`StateScope` | [state-store](/docs/core/state-store/) |
| <a id="storeobservation"></a>`StoreObservation` | [state-store](/docs/core/state-store/) |
| <a id="urladapter"></a>`UrlAdapter` | [url](/docs/core/url/) |
| <a id="urlconnection"></a>`UrlConnection` | [url](/docs/core/url/) |
| <a id="statestore"></a>`StateStore` | [state-store](/docs/core/state-store/) |
| <a id="createstatestore"></a>`createStateStore` | [state-store](/docs/core/state-store/) |
| <a id="clock"></a>`Clock` | [state-store](/docs/core/state-store/) |
| <a id="timerclock"></a>`TimerClock` | [runtime](/docs/core/runtime/) |
| <a id="valueport"></a>`ValuePort` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="stateport"></a>`StatePort` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="queryport"></a>`QueryPort` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="port"></a>`Port` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="childactionrequest"></a>`ChildActionRequest` | [registry](/docs/core/registry/) |
| <a id="actioncontext"></a>`ActionContext` | [registry](/docs/core/registry/) |
| <a id="actionhandler"></a>`ActionHandler` | [registry](/docs/core/registry/) |
| <a id="codeactionspec"></a>`CodeActionSpec` | [registry](/docs/core/registry/) |
| <a id="codeactiondefinition"></a>`CodeActionDefinition` | [registry](/docs/core/registry/) |
| <a id="actionsnapshot"></a>`ActionSnapshot` | [view](/docs/core/view/) |
| <a id="valueexpression"></a>`ValueExpression` | [values](/docs/dsl/values/) |
| <a id="inputexpressions"></a>`InputExpressions` | [values](/docs/dsl/values/) |
| <a id="pathexpression"></a>`PathExpression` | [values](/docs/dsl/values/) |
| <a id="actionspec"></a>`ActionSpec` | [actions](/docs/dsl/actions/) |
| <a id="actioncall"></a>`ActionCall` | [actions](/docs/dsl/actions/) |
| <a id="step"></a>`Step` | [actions](/docs/dsl/actions/) |
| <a id="httprequest"></a>`HttpRequest` | [datasources](/docs/dsl/datasources/) |
| <a id="datasourcespec"></a>`DatasourceSpec` | [datasources](/docs/dsl/datasources/) |
| <a id="querysource"></a>`QuerySource` | [queries](/docs/dsl/queries/) |
| <a id="transformstep"></a>`TransformStep` | [queries](/docs/dsl/queries/) |
| <a id="queryspec"></a>`QuerySpec` | [queries](/docs/dsl/queries/) |
| <a id="variablespec"></a>`VariableSpec` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="queryuse"></a>`QueryUse` | [queries](/docs/dsl/queries/) |
| <a id="querydefaults"></a>`QueryDefaults` | [queries](/docs/dsl/queries/) |
| <a id="resourcestatedeclaration"></a>`ResourceStateDeclaration` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="reaction"></a>`Reaction` | [state-and-ports](/docs/dsl/state-and-ports/) |
| <a id="componentpubliccontract"></a>`ComponentPublicContract` | [view-and-component](/docs/dsl/view-and-component/) |
| <a id="componentcontract"></a>`ComponentContract` | [registry](/docs/core/registry/) |
| <a id="componentspec"></a>`ComponentSpec` | [view-and-component](/docs/dsl/view-and-component/) |
| <a id="viewspec"></a>`ViewSpec` | [view-and-component](/docs/dsl/view-and-component/) |
| <a id="componentnode"></a>`ComponentNode` | [view-and-component](/docs/dsl/view-and-component/) |
| <a id="resourcespecs"></a>`ResourceSpecs` | [resources](/docs/dsl/resources/) |
| <a id="anyresource"></a>`AnyResource` | [resources](/docs/dsl/resources/) |
| <a id="registeredresource"></a>`RegisteredResource` | [resources](/docs/dsl/resources/) |
| <a id="registry"></a>`Registry` | [registry](/docs/core/registry/) |
| <a id="createregistry"></a>`createRegistry` | [registry](/docs/core/registry/) |
| <a id="viewtarget"></a>`ViewTarget` | [runtime](/docs/core/runtime/) |
| <a id="initialreport"></a>`InitialReport` | [runtime](/docs/core/runtime/) |
| <a id="applicationresult"></a>`ApplicationResult` | [runtime](/docs/core/runtime/) |
| <a id="nodesnapshot"></a>`NodeSnapshot` | [view](/docs/core/view/) |
| <a id="viewsnapshot"></a>`ViewSnapshot` | [view](/docs/core/view/) |
| <a id="runtimeoptions"></a>`RuntimeOptions` | [runtime](/docs/core/runtime/) |
| <a id="runtime"></a>`Runtime` | [runtime](/docs/core/runtime/) |
| <a id="createruntime"></a>`createRuntime` | [runtime](/docs/core/runtime/) |
| <a id="view"></a>`View` | [view](/docs/core/view/) |
| <a id="celvalue"></a>`CelValue` | [cel](/docs/core/cel/) |
| <a id="celfunction"></a>`CelFunction` | [cel](/docs/core/cel/) |
| <a id="httpexecutionplan"></a>`HttpExecutionPlan` | [http](/docs/core/http/) |
| <a id="httpresponse"></a>`HttpResponse` | [http](/docs/core/http/) |
| <a id="requestexecutor"></a>`RequestExecutor` | [http](/docs/core/http/) |
| <a id="mergeownedurl"></a>`mergeOwnedUrl` | [url](/docs/core/url/) |
| <a id="gridconfig"></a>`GridConfig` | [utilities](/docs/core/utilities/) |
| <a id="gridplacement"></a>`GridPlacement` | [utilities](/docs/core/utilities/) |
| <a id="computegridlayout"></a>`computeGridLayout` | [utilities](/docs/core/utilities/) |

## @viewstem/core/http

| Public name | Detailed reference |
|---|---|
| `HttpExecutionPlan` | [http](/docs/core/http/) |
| `HttpResponse` | [http](/docs/core/http/) |
| `RequestExecutor` | [http](/docs/core/http/) |
| <a id="httpexecutoroptions"></a>`HttpExecutorOptions` | [http](/docs/core/http/) |
| <a id="createhttpexecutor"></a>`createHttpExecutor` | [http](/docs/core/http/) |

## @viewstem/core/cel

| Public name | Detailed reference |
|---|---|
| `CelFunction` | [cel](/docs/core/cel/) |
| `CelValue` | [cel](/docs/core/cel/) |
| <a id="cellimits"></a>`CelLimits` | [cel](/docs/core/cel/) |
| <a id="defaultcellimits"></a>`defaultCelLimits` | [cel](/docs/core/cel/) |
| <a id="celoptions"></a>`CelOptions` | [cel](/docs/core/cel/) |
| <a id="compilecel"></a>`compileCel` | [cel](/docs/core/cel/) |
| <a id="evaluatecel"></a>`evaluateCel` | [cel](/docs/core/cel/) |

## @viewstem/core/cel-support.json

A JSON asset listing supported CEL features and signatures, not a callable function. See [CEL](../cel/) for supported behavior and limits.

Use `import type` for type-only exports. This index covers the public package boundary; internal Registry/Runtime classes and private helpers are not public APIs.
