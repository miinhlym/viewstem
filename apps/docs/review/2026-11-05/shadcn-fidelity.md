# shadcn-svelte 원본 사용과 기본 디자인 복원

2026-11-05. 사용자가 옵션 조작부와 미리보기에 shadcn-svelte를 그대로 사용하도록 수정 요청했다. D125에 반영했다.

> 후속 전체 감사에서 이 기록의 검사가 CSS cascade·전체 preflight·모든 내부 래퍼까지 보장하지 못했음을 확인했다. 추가 원인·수정·전수 검증은 [전체 감사](shadcn-full-audit.md)를 따른다.

## 수정

이전 미리보기는 고정 공식 Nova 소스를 사용했지만 사이트의 청록색·남색 토큰이 기본 Neutral 색상을 덮어썼다. 옵션 조작부는 일반 HTML input/select/checkbox와 자체 CSS였으며, Field.Group의 stretch 배치가 예제 버튼을 가로로 늘렸다. 기능 검사 통과가 원본 디자인 일치를 의미하지 않았다는 점을 정정한다.

- `DemoOptions.svelte`는 공개 `components` export의 실제 Field, Input, Checkbox, Native Select, Button을 조합한다. 직접 만든 입력·체크박스·셀렉트 디자인을 제거했다. 크기·색상·모서리는 원본 variant를 사용하고, 별도 CSS는 옵션 영역의 반응형 배치와 JSON 경로 표시만 담당한다.
- Astro의 재실행·복사 버튼도 실제 원본 Button의 서버 렌더링을 사용한다.
- 문서 예제의 shadcn marker에서 사이트 `--viewstem-*` 덮어쓰기를 해제해 고정 원본 Neutral 기본값으로 돌아간다. Dialog·Sonner 등 본문 밖 포털에도 적용하며 공통 헤더는 제외한다. 미리보기와 옵션 영역의 바탕도 Neutral이다. 이전에 사용자가 지정한 사이트 서체는 유지한다.
- Field.Group 예제의 정렬을 시작점으로 지정해 버튼 등 자연 너비 요소를 억지로 늘리지 않는다. 입력 폼 등 원래 너비가 지정된 컴포넌트는 해당 원본 클래스에 따른다. 이 배치도 표시·복사·실행 JSON에 동일하게 포함한다.
- 옵션 조작부는 SSR + Astro hydration으로 제공한다. 상세 필드에서 옵션으로 돌아오는 앵커가 정적 HTML에도 존재한다. 문서 HTML 파싱 완료 후 런타임을 연결해 island 뒤 JSON·코드가 아직 도착하지 않은 경우를 처리한다.
- JSON·실제 UI·레퍼런스 연결, 한글 조합 입력, 유효한 값만 적용, 현재 설정 재실행과 기본값 복원, 최신 요청만 실행하는 수명 계약을 유지한다.

공개 패키지의 원본 컴포넌트나 어댑터를 재작성하지 않았다. 기존 고정 소스는 `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`, Nova/Neutral이다. 원본 변환 검사에서 456파일·62 Nova 계열·386부품 일치를 확인했다. 공식 [테마](https://shadcn-svelte.com/docs/theming), [Field](https://shadcn-svelte.com/docs/components/field), [Checkbox](https://shadcn-svelte.com/docs/components/checkbox), [Native Select](https://shadcn-svelte.com/docs/components/native-select), [Input](https://shadcn-svelte.com/docs/components/input)을 참고했다.

## 리뷰와 검증

독립 리뷰에서 테마 초기화가 공통 헤더 marker까지 침범하는 문제를 찾아 헤더를 제외했다. SSR 전환 중 HTML을 island 뒤에서 1.5초 나눠 보내면 초기화가 먼저 실행되는 문제도 재현해 DOMContentLoaded 대기로 수정했다. 리뷰어가 수정 소스를 재확인했다.

- 한·영 132개 계열 페이지의 렌더링·JSON·메뉴·모바일 넘침과 대표 상호작용 회귀 통과. 이후 수정은 8개 옵션 페이지의 초기화 대기와 패널 배경·여백이며, 해당 범위는 최종 옵션 매트릭스로 다시 통과했다. [132페이지 결과](shadcn-fidelity/regression.json)
- 최종 64조합(8계열 × 한·영 × 밝게·어둡게 × 320·1440px)·152옵션 변경 통과. 실제 원본 marker, 체크박스 16px·버튼 자연 너비, Neutral 기본 토큰과 Dialog 포털, 공통 헤더 테마 보존을 검사했다. HTML 1.5초 분할 전송, SSR 옵션 직접 링크, IME·초기화·복사·빠른 입력·실패 복구 추가 흐름도 통과했다. [결과](shadcn-fidelity/options.json)
- 335 HTML·123 언어 쌍·46,100 내부 링크와 앵커 오류 0. [결과](shadcn-fidelity/site-integrity.json)
- 실제 표시된 setup.ts/view.json 132쌍 타입 검사 통과.
- docs 타입 검사: 오류·경고·hint 0. Svelte autofixer 오류 0. onMount에서 컨테이너를 찾는 bind:this를 attachment로 대체할 수 있다는 일반 제안은 현재 명확한 수명 구성을 유지하기 위해 적용하지 않았다.
- 렌더러 수명 단위 테스트 4개와 66계열 × 2언어 레퍼런스 생성 일치 통과.
- 4321 개발 서버에서 밝은 1440px·어두운 375px 화면을 직접 확인했다. 기본 버튼 높이 32px·자연 너비 약 50px와 원본 Neutral 색상, 키보드 Checkbox 조작과 복원을 확인했다. [결과](shadcn-fidelity/dev-smoke.json)
- Astro 정적 빌드 완료. 기존 sitemap 주소 미설정·Markdown 설정 폐기 예정 알림은 별도다.

검증 브라우저는 Chromium이다. 원본 소스와 실제 토큰·크기·행동을 확인했으며, 공식 사이트 전체와의 픽셀 단위 동일성이나 Firefox·WebKit 검증을 주장하지 않는다. 배포하지 않았다.
