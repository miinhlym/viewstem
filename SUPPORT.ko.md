# 지원

[English](SUPPORT.md) | 한국어

사용 질문, 버그 제보, 기능 제안은 [GitHub Issues](https://github.com/miinhlym/viewstem/issues)를
이용하세요. 영어와 한국어 모두 환영합니다. 새 이슈를 열기 전에 기존 이슈의
논의를 검색하세요. 버그 제보에는 패키지 버전이나 소스 커밋, 실행 환경, 최소 재현,
기대한 동작과 실제 동작을 포함하세요.

보안 문제는 [보안 제보](SECURITY.ko.md), 커뮤니티 행동 관련 신고는
[행동강령](CODE_OF_CONDUCT.ko.md)의 절차를 따르세요.
공개 이슈에 자격 증명이나 비공개 데이터를 포함하지 마세요.

## 유지보수 정책

각 패키지의 최신 릴리스를 유지보수 대상으로 합니다. 사전 릴리스만 있다면
최신 사전 릴리스를 뜻합니다. 이전 버전에 대한 별도 유지보수나 보안 수정 역이식
약속은 없으며, 수정을 적용하려면 업그레이드가 필요할 수 있습니다.
현재 소스 브랜치에 대한 제보도 환영하지만 미발행 커밋을 지원 중인 공개 릴리스로
취급하지는 않습니다.

Viewstem은 개인이 가능한 범위에서 유지보수합니다. 응답 시간, 수정 기한,
릴리스 일정, 장기 지원 기간, 서비스 수준 협약(SLA)을 보장하지 않습니다.
이슈 등록이 구현을 보장하지는 않습니다. 소프트웨어 보증과 책임 조건은
[MIT 라이선스](LICENSE)에 명시되어 있습니다.

## 지원 동작과 환경

공개 계약과 제한은 해당 패키지 문서를 확인하세요.

- [Core](packages/core/README.ko.md): 프레임워크 독립 런타임과 CEL 지원.
- [Svelte](packages/svelte/README.ko.md): Svelte 5 클라이언트 렌더러와 명시적 등록.
- [Svelte UI](packages/svelte-ui/README.ko.md): shadcn JSON 어댑터, native 전용 부품, 지원 조합.

검사하는 Node 버전 행렬은 [CI workflow](.github/workflows/core.yml)가 정의합니다.
현재 브라우저 실행 증거는 Chromium에 해당합니다. Firefox, WebKit,
SSR·hydration, 실제 모바일 제스처 지원을 입증하지는 않습니다.
현재 검증 기록은 [문서 지도](docs/README.ko.md)에서 확인하세요.

`package.json`의 버전이나 로컬 테스트 통과가 npm 발행의 증거는 아닙니다.
개발 예제는 샘플 데이터를 사용하며 호스팅 서비스가 아닙니다.
