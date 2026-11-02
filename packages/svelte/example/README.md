# Svelte 소비자 예제

저장소 루트에서 실행합니다.

```sh
npm run build:svelte && node packages/svelte/example/server.mjs
```

`http://127.0.0.1:4174`에서 이름을 입력하고 초기화 버튼을 눌러 확인합니다. 포트는 `PORT` 환경 변수로 바꿀 수 있습니다. 소스를 수정하면 서버를 재시작합니다.

- `definition.ts`: 호스트 Component 계약과 JSON으로 직렬화할 수 있는 View입니다. 입력 이벤트 → 인라인 SetState Action → Derived → Label로 연결합니다.
- `adapters/`: 호스트가 제공하는 네 Svelte 구현입니다. Stack이 default·footer slot의 실제 배치를 결정합니다. Input·Button은 `node.status`가 준비된 경우에만 이벤트를 보냅니다.
- `App.svelte`: `createRenderer()`로 시작해 계약과 어댑터를 각각 명시적으로 등록하고, `renderer.runtime.createView` 결과를 `<ViewstemView>`에 전달합니다. 앱 종료 시 `renderer.dispose()`가 내부 Runtime과 View까지 정리합니다.

이 예제는 Viewstem API와 공통 타입을 모두 공개 `@viewstem/svelte` 진입점에서 가져오는 클라이언트 앱입니다. core는 내부 의존성입니다. 기본 컴포넌트나 자동 등록을 전제하지 않습니다. 로컬 서버는 빌드한 HTML·JavaScript만 loopback 주소에서 제공합니다.
