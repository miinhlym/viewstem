# Viewstem

현재 공개 API 이름과 변경 후 검증은 [U42 네이밍 적용](docs/handoff/public-api-naming-2026-11-02.md), [검증 기록](docs/handoff/public-api-naming-verification-results.json)을 따른다. U41 및 이전 기록의 API 이름·해시는 당시 증거로 보존한다.

A framework-independent runtime for declarative UIs.

JS/TS core의 [패키지 사용법](packages/core/README.md), [구현 범위와 제한](docs/handoff/core-implementation-2026-11-02.md), [실제 검증 결과](docs/handoff/core-verification-results.json)를 확인하세요. 로컬 구현·검증과 공개 발행 상태는 구별합니다.

현재 공개 API 경계와 이전 import 변경은 [API 변경 안내](docs/handoff/public-api-refactor-2026-11-02.md), 이후 재실행 결과는 [API 검증 기록](docs/handoff/public-api-verification-results.json)을 따릅니다.

JSON을 편집하며 실제 core 동작을 확인하려면 `npm ci --ignore-scripts` 후 `npm run playground`를 실행하세요. [바닐라 플레이그라운드](playground/README.md)에서 화면 미리보기와 State·Query·Action을 확인할 수 있습니다.

Svelte 앱에는 [@viewstem/svelte](packages/svelte/README.md)를 사용합니다. 기본 UI 자동 등록 없이 호스트의 Svelte 컴포넌트를 core 계약에 연결합니다. `npm run example:svelte`로 실제 앱 예제를 실행하고 `npm run check:svelte`로 패키지·타입·브라우저를 검증합니다.

shadcn-svelte UI는 [@viewstem/svelte-ui](packages/svelte-ui/README.md)에서 명시적으로 등록합니다. `npm run example:svelte-ui`로 66개 컴포넌트군의 JSON 편집·미리보기·실행 상태 갤러리를 엽니다. [구현 범위와 검증](docs/handoff/svelte-ui-shadcn-implementation-2026-11-03.md)은 JSON 부품과 native 문맥 전용 부품을 구분합니다.

- [문서 지도와 읽는 순서](docs/README.md)
- [현재 설계 명세](docs/VIEWSTEM-SPEC.md)
- [수정·검증을 이어갈 시작 지점](docs/handoff/implementation-start.md#새-채팅에서-시작할-때)
- [후속 작업과 미결 범위](docs/handoff/open-contracts.md#실제-남은-작업)
- [결정과 변경 이력](docs/history/)

실제 구현 및 지원 범위는 코드와 실행된 테스트를 기준으로 확인합니다.
