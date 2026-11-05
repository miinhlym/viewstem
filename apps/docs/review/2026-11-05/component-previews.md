# 전체 컴포넌트 메뉴와 실행 예제

2026-11-05. 사용자 요청에 따라 라이브러리 사이트를 변경했다. D122는 이전 D117의 ‘현재 계열만 메뉴에 노출’ 결정을 대체한다. 다른 작업의 D119–D121은 보존했다.

## 적용 내용

- 지원하는 66개 shadcn 계열을 좌측 메뉴에 모두 나열했다. 현재 항목이 보이도록 메뉴 안에서만 스크롤하며 한·영 페이지의 현재 위치와 인접 탐색을 유지한다. API 하위 메뉴의 attributes 페이지도 연결했다.
- 한·영 총 132개 계열 페이지에 실제 UI, 동일한 View JSON, 복사, 미리보기 초기화, 해당 예제를 실행할 등록 코드를 추가했다. 본문의 상세 공개 계약은 유지한다.
- 사이트가 소유하는 예제 하나를 실제 공개 렌더러의 입력과 JSON 표시에 함께 사용한다. 테스트 fixture를 제품 코드에 가져오지 않는다. 참조하는 계열만 동적으로 로드한다.
- 예제는 입력·상태·이벤트 연결을 포함한다. Sonner는 필요한 호스트 Action과 해제 처리도 제공하며 setup.ts에도 동일 등록 함수를 표시한다. JSON에 직접 등록할 수 없는 네이티브 문맥 부품은 지원 경계를 설명한다.
- 미리보기와 코드의 밝은/어두운 테마를 맞췄다. 넓은 예제와 긴 JSON은 해당 영역에서 스크롤한다. 초기화·페이지 이탈의 비동기 렌더러 수명을 관리한다.
- Storybook식 옵션 편집 제안은 별도 검토 대상이며 이번 구현에 포함하지 않았다.

## 검증

최종 Astro 사이트 빌드 성공: 331개 페이지, 검색 대상 HTML 335개. 기존 패키지 빌드 결과를 사용했다. 문서 타입 검사(Astro 54개 파일 및 strict TypeScript) 오류·경고·힌트 0개.

정적 검사: 한·영 123쌍, 컴포넌트 페이지 132개, 문서 메뉴 246개 각각 66개 링크, 로컬 링크/앵커 46,024개, 오류 0개. 생성기 --check 및 git diff --check 통과.

Chromium에서 132개 페이지 전부 실제 마운트·예제 원본/표시 JSON 일치·현재 메뉴를 확인했고, 1440px 및 320px에서 페이지 가로 넘침이 없었다. 한·영 각각 Button Action/초기화/JSON 클립보드, Input State, Checkbox/Switch, Tabs/Select, Accordion/Dialog, Calendar, 긴 메뉴/모바일 키보드의 7묶음(총 14묶음) 검증이 통과했다.

추가 데이터 담당 검증은 375px에서 Sidebar, AlertDialog, Attachment 실제 CSV 다운로드, ContextMenu, MessageScroller, ScrollArea, Carousel, Skeleton, Sonner, Questionnaire의 상호작용과 배치를 다뤘다. Sonner의 모바일 닫기 버튼이 문서 헤더와 겹치던 위치를 우측 하단으로 수정했다.

최종 빌드 HTML에서 추출한 **132개 setup.ts/view.json 쌍**을 그대로 strict TypeScript 검사했다. JSON import의 넓어진 판별 타입을 공용 ViewSpec으로 전달하며 런타임 검증이 수행된다는 점을 예제에 명시했다. 기존 프로젝트와 같이 skipLibCheck를 적용했다. 작성 예제 코드를 검사에서 제외하지 않았다.

검증 스크립트: `scripts/verify-docs-site.mjs`, `scripts/verify-component-demos.mjs`, `scripts/verify-component-setup.mjs`. [수치와 각 페이지 결과](component-previews-verification.json).

## 한계

전체 페이지 검사는 모든 공개 옵션 조합을 실행했다는 뜻이 아니다. Firefox/WebKit은 실행하지 않았다. 공개 locale 입력이 없는 DataTable 등의 패키지 내부 기본 문구 일부는 영문으로 남는다. 빌드의 기존 markdown deprecation·chunk size·sitemap site 미설정 경고는 남아 있다. 커밋·외부 배포는 하지 않았다.

전체 workspace 타입 검사 `npm run typecheck --workspaces --if-present`도 최종 통과했다. Core, Svelte와 consumer example, Svelte UI, Docs를 포함한다. [실행 로그](component-previews-typecheck.log).
