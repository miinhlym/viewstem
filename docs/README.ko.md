# Viewstem 문서

[English](README.md) | 한국어

## 출시된 패키지 사용하기

[공개 문서 사이트](https://viewstem.miinhlym.workers.dev/ko/docs/)에서 설치 방법, 예제, API를 확인할 수 있습니다. 운영 사이트는 해당 빌드에 고정된 npm 버전을 사용합니다. 패키지 README에서 이 페이지로 왔다면 아래 링크는 그 패키지가 가리킨 Git 리비전에 머뭅니다.

| 패키지 | 사용 안내 | 공개 API 정의 |
| --- | --- | --- |
| Core | [패키지 안내](../packages/core/README.ko.md) | [Core 타입](../packages/core/src/index.d.ts), [HTTP 타입](../packages/core/src/http.d.ts), [CEL 타입](../packages/core/src/cel.d.ts) |
| DOM | [패키지 안내](../packages/dom/README.ko.md) | [DOM export](../packages/dom/src/index.ts) |
| Svelte | [패키지 안내](../packages/svelte/README.ko.md) | [Svelte export](../packages/svelte/src/lib/index.ts) |
| UI | [패키지 안내](../packages/ui/README.ko.md) | [UI export](../packages/ui/src/index.ts), [지원 카탈로그 진입점](../packages/ui/package.json#L22) |

[공개 사이트 문서 원본](../apps/docs/src/content/docs/ko/docs/)과 [제품 계약](VIEWSTEM-SPEC.md)도 이 리비전에서 확인할 수 있습니다. [소비자용 스킬](../skills/viewstem/SKILL.md)은 [Codex 설치 및 지원 안내](../skills/viewstem/integrations/codex.md)를 따릅니다.

<a id="처음-참여했다면"></a>
<a id="현재-명세"></a>
<a id="이후-유지-방법"></a>

## 저장소 유지보수

| 작업 | 시작 문서 |
| --- | --- |
| 런타임·브라우저 렌더러·호스트 통합 수정 | [구현 아키텍처](architecture.md), [제품 계약](VIEWSTEM-SPEC.md) |
| 설계 결정의 근거 확인 | [설계 결정](decisions.md) |
| 소비자용 스킬 수정 및 평가 | [스킬 설계와 검증](../skills/README.md) |
| 변경 범위에 맞는 검사 선택·결과 재현 | [검증 안내](verification.md) |
| 패키지 발행·사이트 배포·복구 | [릴리스 절차](releasing.md) |
| 사이트 콘텐츠·경로·예제·Playground 수정 | [사이트 유지보수](../apps/docs/README.ko.md) |
| 기여·지원·보안 제보 | [기여 안내](../CONTRIBUTING.md), [지원](../SUPPORT.md), [보안 정책](../SECURITY.md) |

[제품 명세](VIEWSTEM-SPEC.md)는 언어에 독립적인 세부 계약으로 연결됩니다. 공개 패키지에 포함되지 않은 범위는 [후속 작업](follow-up.md#실제-남은-작업)을 확인하세요. 과거 실험과 결정은 현재 계약의 근거 또는 검증 재현에 필요한 곳에서 연결합니다.
