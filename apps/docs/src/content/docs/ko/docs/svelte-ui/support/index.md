---
title: 지원 메타데이터와 스타일시트
description: 기계가 읽을 수 있는 지원 카탈로그와 번들 스타일시트의 계약을 설명합니다.
sidebar:
  order: 6
---

## `@viewstem/svelte-ui/shadcn/support.json`

고정된 카탈로그를 설명하는 JSON export입니다. 계약을 확인하거나 작성 도구에서 사용할 수 있습니다. `componentRef`에 ID를 제안하기 전에 `mode`를 확인하세요.

```ts
import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };

const entry = support.components.find((part) => part.id === 'shadcn.Button');
if (entry?.mode === 'json') {
  console.log(Reflect.get(support.properties, entry.propertiesRef).variant);
  console.log(Reflect.get(support.callbacks, entry.callbacksRef).click);
}
```

| 필드 | 내용 |
| --- | --- |
| `formatVersion` | 카탈로그 데이터 형식 버전입니다. 현재 값은 `1`입니다. |
| `upstreamCommit` | 고정된 shadcn-svelte 원본 커밋입니다. |
| `families`, `upstreamComponents`, `recipes` | 패밀리, 네이티브 부품, JSON 조합의 수입니다. |
| `components[]` | `id`, `family`, `mode`, `recipe`, `slots`, 세 사전의 참조를 담습니다. 네이티브 문맥이 필요한 항목에는 `limitation`이 있습니다. |
| `properties[propertiesRef]` | 입력 이름과 값 스키마입니다. 해당되는 경우 필수 여부, 코덱, 제약도 담습니다. |
| `callbacks[callbacksRef]` | 이벤트 이름과 인수 스키마입니다. 페이로드 코덱이 있으면 함께 담습니다. |
| `unsupported[unsupportedRef]` | JSON 계약 밖에 있는 네이티브 기능과 이유입니다. |

`mode: "json"`인 항목에는 등록되는 어댑터가 있습니다. `mode: "native-context"`인 항목의 ID는 이 파일 안에서 부품을 식별합니다. Svelte에서 해당 부품의 네이티브 export를 사용하세요. `p16` 같은 키는 이 스냅샷의 사전 참조입니다. 컴포넌트 항목에서 조회하세요.

<a id="event-payloads"></a>

## 이벤트 페이로드

`dom` 코덱 이벤트의 스키마는 직접 전달하는 페이로드를 설명합니다. 어댑터는 DOM 이벤트나 대상 요소에서 읽을 수 있는 필드를 복사합니다.

| 필드 | 타입 |
| --- | --- |
| `type` | `string` |
| `value`, `key`, `code` | 선택 `string` |
| `checked`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey` | 선택 `boolean` |
| `button`, `buttons` | 선택 `number` |

다른 코덱과 네이티브 콜백의 스키마는 `{ "value": ... }` 안의 값을 설명합니다. 콜백 인수가 없으면 `null`을 담습니다. 날짜 코덱은 날짜 문자열, 날짜 배열, `{ start, end }` 범위를 네이티브 날짜 값과 상호 변환합니다. 입력 스키마에서 `null`을 허용하면 날짜 코덱은 이를 값이 없는 상태로 해석합니다. 필수 필드와 형태는 입력별 스키마를 확인하세요.

지원되는 DOM `submit` 이벤트의 기본 페이지 이동은 어댑터가 막습니다. HTML 타입이 `number`인 입력도 DOM `value`는 문자열로 전달합니다. 숫자 Action 입력에 넘길 때 변환하세요.

<a id="stylesheet"></a>

## `@viewstem/svelte-ui/shadcn/styles.css`

전체 키트의 스타일시트입니다. 빌드된 테마, 컴포넌트 유틸리티, 범위를 제한한 기본 스타일을 포함합니다. Vega 스타일과 Neutral 팔레트를 사용합니다. `--viewstem-`으로 시작하는 CSS 사용자 정의 속성으로 테마 토큰을 바꿀 수 있습니다. 포털에도 적용되는 예시는 [키트 스타일 적용](../guides/style-and-native/)을 참고하세요.

패키지 소비 환경 검증에는 Node 22와 24, Svelte 5, 브라우저 클라이언트, TypeScript Bundler 해석을 사용합니다. 렌더러 통합 대상은 브라우저 클라이언트입니다. 전체 세트의 모드 감시 기능은 로컬 스토리지에 접근할 수 있는 origin을 요구합니다.
