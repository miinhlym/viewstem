# 사이트 공통 서체 적용

2026-11-05. 사용자가 Pretendard·D2Coding·Noto Sans Symbols 2 구성을 수락하고 사이트 전체 적용과 문자 표시 검증을 요청했다. 현재 명세 §3.4와 D112에 기록했다.

## 적용

- `apps/docs/src/styles/site-theme.css`에서 한글·영문 제목, 본문, 탐색, 검색, 폼 컨트롤에 공통 Pretendard 스택을 제공한다. 홈·문서·예제·Playground가 이미 공유하는 스타일 진입점을 사용한다.
- 인라인 코드, 코드 블록, 단축키 표기와 CodeMirror 편집기는 D2Coding을 사용한다. 일반 코드와 `.cm-editor .cm-content`에 합자 비활성화를 명시한다. 편집기 상위 요소의 `font` 단축 속성이 합자 설정을 초기화하므로 실제 텍스트 요소에 적용했다.
- 부족한 기호는 Noto Sans Symbols 2, 이모지는 OS 컬러 이모지로 표시한다. SVG 아이콘을 유지한다. 라이브러리 패키지의 기본 서체는 변경하지 않는다.
- `fonts.css`와 `public/fonts/`에 웹폰트를 포함한다. Pretendard 1.3.9의 공식 Unicode 분할 파일을 그대로 사용하고 현재 문자가 필요한 파일만 요청한다. D2Coding regular/bold와 Noto Sans Symbols 2는 공식 TTF를 FontTools 4.68.0으로 WOFF2 압축했다. 글리프를 제거하지 않았다. 모두 `font-display: swap`을 사용한다.
- 각 폰트의 OFL 라이선스, 출처·버전·원본 및 변환 결과 SHA-256은 `public/fonts/README.md`, `sources.json`, 각 폴더의 `OFL.txt`에 보존한다. 외부 CDN 요청은 필요하지 않다.

## 검증 결과

[실행 결과](docs-typography-verification-2026-11-05.json)에 문자 커버리지, 반응형 검사, 실제 렌더링 폰트를 기록했다.

- `apps/docs`에서 `astro build` 통과: 119 페이지 빌드 및 Pagefind 검색 색인 생성. 기존 런타임 빌드 출력을 재사용했다. 기존 markdown deprecation·큰 번들·site 미설정 sitemap 경고는 남아 있다.
- 정적 HTML 123개(리다이렉트 포함)의 스크립트·스타일·SVG를 제외한 텍스트에서 서로 다른 문자 529종을 추출하고 번들 폰트의 실제 cmap과 대조했다. 누락 0종. 이는 현재 콘텐츠의 글리프 보유 검사이며 전체 Unicode 지원을 뜻하지 않는다.
- 출처 기록에 있는 배포 폰트·라이선스의 SHA-256 대조에서 불일치 0개.
- 영·한 홈, 영문 예제 목록, 한국어 첫 View 예제, 영·한 Playground, 영·한 값과 입력 문서의 8개 경로를 320·768·1440px에서 검사했다. 24개 조합에서 가로 넘침 0개, 본문·코드·편집기 폰트 스택 일치. 이후 합자 규칙만 보완했으므로 해당 편집기 동작을 추가 검증했다.
- macOS Ego Chromium의 CSS.getPlatformFontsForNode로 실제 글리프 렌더러를 확인했다. 한글·영문·문장부호·굵은 글씨는 Pretendard, 코드와 실제 문서 코드 토큰·편집기는 D2Coding, 기본 폰트에 없는 점자·화살표와 체크 기호는 Noto Sans Symbols 2, 이모지는 Apple Color Emoji가 사용됐다.
- 임시 검사 영역에서 한글 자형, 영문·숫자, 따옴표·괄호, 화살표·수학·통화 기호, 점자, 컬러 이모지, 혼용 코드를 화면으로 확인했다. 이 검사 영역은 제품에 추가하지 않았다.
- Playground에서 실제 편집기로 `한글 English → ✓ ⠿ 😀`를 포함한 Button View를 입력·실행하고 코드와 실행 결과를 확인했다. 편집기와 문서 코드의 최종 `font-variant-ligatures`는 `none`이다.
- 문서 모바일 화면·데스크톱 화면·Playground 화면을 확인했다. Pagefind 검색에 `계산`을 입력해 결과와 검색 입력·결과 서체를 확인했다. 기존 개발 서버에서도 새 서체가 로드된다.
- `git diff --check` 통과. Windows·Android·Safari의 실제 렌더링은 이번 검증 범위에 포함되지 않는다. 배포와 커밋은 수행하지 않았다.
