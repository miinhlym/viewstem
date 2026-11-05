---
title: Queries and data
description: Read, transform, and observe data through Query instances.
---

A **Query** describes where data comes from and how to produce a result. A View or Component declares a Query use in `queries` and reads its result through `/queries/name/data`.

## Read a result

Start with a complete View that needs no server. Its Query has no sources and returns the literal **Projects**.


```json
{
  "queries": {
    "projects": {
      "query": {
        "sources": {},
        "transform": {
          "input": "Projects"
        }
      }
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/queries/projects/data"
      }
    }
  }
}
```


`projects` names this Query instance. `query` holds the definition, and `transform.input` selects the value returned as `data`. The badge displays **Projects** after the Query completes.

## Read an HTTP source

For an HTTP request, a **Datasource** supplies connection settings and a source supplies the request. In this View, replace the illustrative URL with an accessible API that returns `{ "title": "Projects" }`.


```json
{
  "queries": {
    "projects": {
      "query": {
        "sources": {
          "main": {
            "datasource": {
              "kind": "Http",
              "baseUrl": "https://example.test"
            },
            "request": {
              "method": "GET",
              "path": "/projects"
            }
          }
        },
        "transform": {
          "input": {
            "@path": "/sources/main/title"
          }
        }
      }
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/queries/projects/data"
      }
    }
  }
}
```


`main` names the source. `/sources/main/title` reads the response field inside the Query, while `/queries/projects/data` reads the transformed result in the View. A Query can also use other Queries as sources and combine results with `Concat` or `Join`.

Public requests can run directly when the browser can access the API. Requests requiring secret credentials must run through the trusted server integration; keep actual secrets out of the View and Datasource JSON sent to the browser.

## Observe readiness and failure

| Observation | Meaning |
|---|---|
| `status` | `idle`, `waiting`, `running`, `success`, or `error`. |
| `waitingReason` | Inputs are not ready or execution is blocked. |
| `data` | The last complete successful result, absent before the first success. |
| `error` | Details of a failed execution. |
| `stale` | The displayed data is not a fresh result for the current execution conditions. |

These fields are read under `/queries/projects`. If a required source or transform fails, the Query fails as a whole. A failed automatic refresh keeps the last complete successful data and exposes the error with `stale: true`; show that it is an older result. An empty successful result is different from an error.

## Control when it runs

Query inputs connect declared ports to values such as State. An eligible Query reacts to input changes. `executeWhen` gates execution; `intervalMs` and `autoRefreshWhen` control polling. A `RefreshQuery` Action step connects to an existing Query through a Query port and waits for a fresh request.

For a server write, invoke a Query explicitly as an Action step. This keeps a create or update request tied to a deliberate operation instead of an automatic read cycle. Reusing a Query definition does not automatically share its instance or results.

The [HTTP example](../../../examples/http-datasource/) uses a simulated response so you can inspect this flow without an API server.

See the [Query reference](../../dsl/queries/) for execution gates, manual refresh, polling fields, and defaults.
