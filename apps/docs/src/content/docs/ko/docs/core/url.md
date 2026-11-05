---
title: "URL 어댑터"
description: "명시적으로 소유한 URL 키와 State를 동기화하고 무관한 URL 내용은 유지합니다."
sidebar:
  order: 14
---

명시적으로 소유한 URL 키와 State를 동기화하고 무관한 URL 내용은 유지합니다.

## connectUrl(options)

쓰기 가능한 State 핸들을 만든 뒤 `store.connectUrl(options)`를 호출하면 `UrlConnection`을 반환합니다.

| 옵션 | 기본값 | 계약 |
|---|---|---|
| `adapter` | 필수 | 아래 `UrlAdapter` 메서드를 구현합니다. |
| `bindings` | 필수 | `{ target: StateHandle, key?: string, history?: 'push' \| 'replace' }`의 읽기 전용 배열입니다. |
| binding의 `key` | `p.${target.address.name}` | 이 연결이 소유하는 고유 URL query 키입니다. |
| binding의 `history` | `'replace'` | 같은 변경에 push binding이 하나라도 있으면 push를 요청합니다. |
| `restore` | `true` | 초기 URL을 State에 복원합니다. |
| `limits` | 아래 표 | 양의 안전 정수로 제한을 덮어쓸 수 있습니다. |
| `onError` | 빈 동작 | URL 진단을 받는 `(error: PublicError) => void`입니다. |

Store당 활성 연결은 하나입니다. binding은 해당 Store의 쓰기 가능한 셀이어야 합니다. 대상과 키는 중복할 수 없습니다. 같은 어댑터를 공유하는 연결들도 동시에 같은 키를 소유할 수 없습니다.

값은 JSON으로 직렬화한 뒤 URL 인코딩하므로 문자열의 JSON 따옴표도 포함합니다. Set은 지원하는 배열 표현을 사용합니다. 문자열·숫자·boolean과 문자열/숫자 배열·Set을 지원하며 nullable 스칼라는 스키마를 따릅니다. 객체·Map·튜플 배열·모호한 union은 URL 프로필이 아닙니다. 키가 없으면 기준값을 복원합니다. 잘못된 입력은 연결 진단으로 기록하므로 URL 값이 승인됐다고 가정하지 말고 결과 State 스냅샷을 확인하세요.

## UrlAdapter

```ts
interface UrlAdapter {
  read(): string;
  subscribe(listener: () => void): () => void;
  writeOwned(
    patch: Readonly<Record<string, string | null>>,
    context: { readonly mode: 'push' | 'replace'; readonly isCurrent: () => boolean },
  ): void | { readonly applied?: boolean } | PromiseLike<void | { readonly applied?: boolean }>;
}
```

`null`은 query 키 제거입니다. 전달받은 키만 변경하세요. 외부 탐색을 구독하고 해제 함수를 반환합니다. 비동기 쓰기라면 실제 URL 변경 직전에 `isCurrent()`를 검사하고, 오래된 쓰기를 생략할 때 `{ applied: false }`를 반환하세요. `void` 또는 `applied: false`가 없는 객체는 반영한 쓰기로 취급합니다.

## UrlConnection

| 멤버 | 동작 |
|---|---|
| `ready: Promise<void>` | 초기 동기화를 진행할 수 있을 때 완료합니다. 초기값 대기 중에는 지연될 수 있습니다. |
| `isReady(): boolean` | 초기화 완료 여부입니다. |
| `restore(): void` | 현재 URL을 다시 읽어 연결된 State에 반영합니다. |
| `getDiagnostics(): readonly PublicError[]` | URL 파싱·제한·복원·쓰기 진단입니다. |
| `removeOwned(selected?): Promise<void \| { applied?: boolean }>` | 전체 소유 키 또는 선택한 연결 State 핸들의 키를 제거하며 replace history를 요청합니다. |
| `dispose(): void` | 관찰을 끝내고 키 소유권을 해제합니다. URL 키를 암묵적으로 지우지는 않습니다. |

## 제한

| 필드 | 기본값 | 측정 대상 |
|---|---:|---|
| `maxOwnedBytes` | 8192 | 인코딩된 소유 query 내용의 UTF-8 바이트 |
| `maxValueBytes` | 4096 | 인코딩된 query 값 하나의 UTF-8 바이트 |
| `maxItems` | 1000 | 배열·Set의 항목 수 |
| `maxKeys` | 128 | binding 수 |

## mergeOwnedUrl(href, patch)

`@viewstem/core`에서 가져옵니다. patch에 포함된 query 키만 교체·제거한 URL 문자열을 반환합니다. 무관한 query 구간의 원래 인코딩과 hash는 보존합니다. 절대 `href`를 전달하는 것이 좋습니다. 상대 주소는 현재 브라우저 위치가 아니라 구현의 임시 기준 주소로 해석합니다.

```js title="merge-url.mjs"
import { mergeOwnedUrl } from '@viewstem/core';
const result = mergeOwnedUrl('https://example.test/?campaign=a%20b&filter=all#list', {
  filter: 'active',
});
console.log(result); // https://example.test/?campaign=a%20b&filter=active#list
```

[State와 URL 가이드](../guides/state-and-url/), [ViewTarget URL 편의 옵션](../runtime/#viewtarget)을 함께 참고하세요.
