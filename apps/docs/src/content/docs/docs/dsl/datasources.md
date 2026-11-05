---
title: HTTP Datasources
description: Define shared HTTP settings, request fields, secret references, and Login token extraction.
sidebar:
  order: 6
---

## DatasourceSpec

A Datasource holds settings shared by HTTP sources. The source selects `datasourceRef` or inline `datasource` and supplies its own `request`.

| Field | Contract |
| --- | --- |
| `kind` | Required literal `"Http"`. |
| `baseUrl` | Required expression yielding an absolute HTTP or HTTPS base URL. User information, query strings, and fragments are forbidden. |
| `headers`, `params` | Optional expressions yielding plain objects of shared headers and URL parameters. |
| `secrets` | Optional map of aliases to nonempty secret reference strings. The server resolves these references to actual values. |
| `auth` | Optional object with `kind: "Login"`, a required `request`, and a required `token` expression. |

## HttpRequest

| Field | Contract |
| --- | --- |
| `method` | Required expression yielding `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, or `OPTIONS`. |
| `path` | Required expression yielding a path joined after the base URL’s existing path. A leading slash is allowed. Schemes, network paths, query strings, fragments, and traversal segments are rejected. |
| `baseUrl` | Optional override. The Datasource default is evaluated only if this field is omitted. |
| `headers` | Optional object expression. Keys merge case-insensitively and the request wins. Use null to remove an allowed inherited header. |
| `params` | Optional object expression. Request keys override defaults by exact spelling. Values are strings, finite numbers, booleans, or arrays of those values. Array entries repeat the key in order. Null and empty arrays omit the key, and an empty string encodes as `name=`. |
| `body` | Optional expression. Forbidden for GET and HEAD. A string defaults to UTF-8 plain text, and other JSON values default to JSON. Explicit JSON media types serialize all JSON values, including strings and null. Form encoding takes the same object profile as params, and `text/*` takes a string. |

Each header declaration is checked before merging. Names use HTTP token syntax and case-insensitive duplicates fail. Values are strings or null, accepting tab and code points U+0020–U+007E or U+0080–U+00FF. Leading and trailing spaces and tabs are trimmed. The default executor reserves these names and prefixes, including when the declared value is null.

- `Accept-Charset`, `Accept-Encoding`, `Access-Control-Request-Headers`, `Access-Control-Request-Method`, `Connection`, `Content-Length`, `Cookie`, `Cookie2`, `Date`, `DNT`, `Expect`, `Host`, `Keep-Alive`, `Origin`, `Referer`, `Set-Cookie`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`, and `Via`
- `Proxy-*`, `Sec-*`, `User-Agent`, `X-HTTP-Method`, `X-HTTP-Method-Override`, and `X-Method-Override`

## Expression scope

| Location | Available values |
| --- | --- |
| Request and Login address or method | Query `/ports`. The actual request can use `/auth/token` after Login. Secret resolution is unavailable while computing the destination. |
| Request headers, params, and body | Query `/ports`, authorized `/secrets/<alias>`, and `/auth/token` after Login. |
| Login headers, params, and body | Query `/ports` and authorized `/secrets/<alias>`. |
| `auth.token` | Only the Login `/response` with `status`, `headers`, and `body`. |

Login inherits only the fallback `baseUrl`. It accepts a request object with expressions or a path to a complete request object. A request returned by a path is used as data without re-evaluating its fields. The built-in executor evaluates HTTP expressions with `concat` and `formatString`. Registry-registered value functions apply to the surrounding View or Query, while HTTP evaluation runs inside its own executor. Token extraction must produce a nonempty string without whitespace or control characters in the ASCII range. Each execution performs its own Login, and a failed Login stops the data request.

This complete QuerySpec reads the token from a Login JSON response and uses it for the data request. Run it through a trusted executor whose authorization allows both destinations and whose secret resolver maps `projects/service-key` to a credential.

```json title="login-query.json"
{
  "sources": {
    "projects": {
      "datasource": {
        "kind": "Http",
        "baseUrl": "https://example.test/api",
        "secrets": { "serviceKey": "projects/service-key" },
        "auth": {
          "kind": "Login",
          "request": {
            "method": "POST",
            "path": "/login",
            "headers": { "X-API-Key": { "@path": "/secrets/serviceKey" } }
          },
          "token": { "@path": "/response/body/accessToken" }
        },
        "headers": {
          "Authorization": { "@call": "concat", "args": ["Bearer ", { "@path": "/auth/token" }] }
        }
      },
      "request": { "method": "GET", "path": "/projects", "params": { "tag": ["open", "active"] } }
    }
  },
  "transform": { "input": { "@path": "/sources/projects" } }
}
```

## Execution boundary

The default executor accepts 2xx responses, parses JSON and text media types, and uses a null body for HEAD, 204, or 205. It rejects redirects, unsupported bodies such as multipart or binary, unsupported response media types, and invalid JSON. Login and the data request share the plan’s timeout. A secret or Login plan requires a trusted `authorize` callback, and each resolved destination and final URL is checked before transport. Place actual credentials in the server-side secret store. See [HTTP executor](/docs/core/http/) for options, timeout, and the plan and response types.
