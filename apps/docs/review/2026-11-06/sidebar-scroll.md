# 문서 사이드바 스크롤 복원 수정

## 원인과 수정

기존 SidebarNavigation은 SSR 기본 펼침 상태로 표시된 뒤 React effect에서 sessionStorage의 그룹 상태를 읽었다. 현재 항목 노출도 PageTitle의 DOMContentLoaded 경로와 SidebarNavigation의 layout effect에서 별도로 수행했다. 사용자가 맞춘 스크롤 위치 자체는 저장하지 않았다. 페이지마다 기본 위치 → 현재 항목 위치 → 펼침 상태에 따른 위치 변경이 발생할 수 있는 구조였다.

설치된 Starlight의 SidebarPersister.astro처럼 서버 렌더링된 사이드바 직후에 인라인 초기화를 실행한다. 저장된 펼침 상태는 임시 CSS로 먼저 반영하고, 그 높이를 기준으로 스크롤을 복원한다. React가 같은 그룹 상태를 반영한 layout commit에서만 임시 규칙을 제거한다. React의 SSR 속성을 직접 변조하지 않아 hydration mismatch를 피한다. 늦게 현재 항목으로 다시 이동하던 두 호출은 제거했다.

스크롤은 언어별 sessionStorage에 저장하며, 클릭·페이지 이탈 시 실제 열린 그룹도 저장한다. 현재 문서 때문에 자동으로 열린 상위 그룹도 다음 페이지에서 유지한다. 현재 항목이 복원된 영역 밖에 있을 때만 최초 표시 전에 노출한다. 모바일 메뉴는 데스크톱 스크롤 저장값을 덮어쓰지 않는다. 저장소를 사용할 수 없어도 현재 항목 노출과 탐색은 동작한다.

## 검증

- `npm run typecheck:docs`: Astro 97파일 오류·경고·hint 0, TypeScript 통과.
- `npm exec -w @viewstem/docs astro build`: 정적 빌드 성공.
- [브라우저 회귀 결과](sidebar-scroll.json): 한영 × light/dark × 1024/1440px = 8조합. 메뉴를 직접 클릭해 이동하고 React 모듈 응답을 지연한 상태부터 매 animation frame의 스크롤을 기록했다. 모든 표시 프레임에서 저장 위치가 유지되었으며 hydration 전후 변화가 없었다. 추가로 새로고침·뒤로가기·다른 메뉴 그룹 이동 시 펼침 상태, 저장소 차단, 모바일 Sheet와 데스크톱 저장값 보존을 확인했다. console/page 오류 없음.

회귀 스크립트: `apps/docs/scripts/verify-sidebar-scroll.mjs`. 검증 브라우저는 Chromium이다. 라이브러리 API나 미리보기 컴포넌트는 변경하지 않았다.
