# 공개 패키지 이후의 작업

현재 공개 범위는 [패키지 안내](README.md#use-a-released-package)와 [지원 정책](../SUPPORT.md#supported-behavior-and-environments), 검사 환경은 [검증 안내](verification.md#checks-and-environments)에서 확인한다.

## 실제 남은 작업

| 범위 | 남은 작업과 완료 기준 |
| --- | --- |
| Dart core·Flutter | 같은 제품 계약을 구현하고 JS/TS와 값·오류·비용 제한을 교차 검증한다. CEL 후보의 [기존 불일치](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/handoff/verification-ledger.md)를 포함한다. |
| 선택 차트 패키지 | 엔진별 공개 입력·지원 옵션·실제 렌더링을 검증한다. [선택 차트 계약](spec/11-optional-charts.md)과 X01–X08을 따른다. |
| 서비스 통합 | 서비스가 resolver, 권한 판단, 비밀 저장소와 라우터를 연결하고 실제 소비 환경에서 검증한다. [호스트 연결](spec/07-host-integration.md)과 [HTTP·인증](spec/01-datasource-auth.md)을 따른다. |
| 환경 확대 | 브라우저·모바일·SSR 또는 운영 부하를 지원 범위에 추가할 때 대상 환경과 완료 기준을 정해 별도 검증한다. |

이미 결정한 계약이나 독립 실험의 이력은 [결정 등록부](decisions.md)에서 찾을 수 있다. 공개 동작이나 지원 범위가 실제로 달라지는 선택이 생겼을 때 관련 계약과 기대값을 함께 갱신한다.
