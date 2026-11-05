# Svelte UI 사이트 미리보기 검토 — 2026-11-06

## 범위와 원본 사용 경계

라이브러리 사이트의 66개 컴포넌트 미리보기와 기존 옵션 편집기 8개 계열·19개 항목을 검토했다. 문서가 보여 주는 JSON과 실제 렌더러가 실행하는 정의는 동일하게 유지한다.

62개 계열은 고정된 공식 shadcn-svelte Nova 소스의 386개 부품을 등록한다. Combobox, DatePicker, DataTable, Typography는 원본 부품을 조합한 레시피다. Chart·Sonner에도 레시피가 있다. shadcn은 소스를 프로젝트로 가져오는 방식이며, 모든 계열이 수정 없는 단일 패키지 export인 것은 아니다. 기존 생성기의 import·아이콘·스코프 표식 변환과 기록된 동작 수정은 유지했다.

## 수정

- Menubar의 추가 버튼 스타일을 제거하고 File/Edit/View 구성을 제공한다. DropdownMenu·Dialog·Drawer·Sheet·Popover의 트리거/닫기는 공식 Button을 child 슬롯으로 조합한다.
- MessageScroller는 Card·Message·Bubble.Content로 구성하고 원래 화살표 버튼을 유지한다. 한국어 이름은 aria-label로 제공한다. 원본 스크롤 동작을 다른 ScrollArea 구현으로 교체하지 않는다.
- Checkbox·Switch·Radio와 Label·Input·Error를 공식 Field 구성에 맞추고 오류 설명을 연결한다. Tabs·Carousel·모달은 실제 용도를 보여 주는 내용을 제공한다.
- 중복 NavigationMenu.Viewport를 제거하고 Trace.Line, Pagination.Link를 사용한다. NavigationMenu.Content의 모든 링크를 단일 레이아웃 자식으로 묶어 Bits UI의 첫 자식 크기 측정에 맞췄다. 마지막 링크의 잘림과 클릭 불가를 수정했다. AlertDialog 확인 버튼에는 제어 중인 open State를 닫는 액션을 연결한다.
- DataTable 레시피에 선택적인 labels를 추가했다. 기존 영어 기본값을 유지하며 한국어 데모에서는 번역을 전달한다. 페이지 크기 변경도 State에 연결한다. Questionnaire 진행·오류 문구를 번역한다.
- 미리보기 바깥 프레임에서 공식 기본 타이포그래피(1rem/1.5)를 복원한다. 내부 위젯의 색·테두리·글꼴 클래스는 덮어쓰지 않는다. 폭이 있는 블록 stage를 사용해 inline-size 컨테이너와 차트가 0폭으로 줄어드는 문제를 막는다.

## 검증

- 66개 전체의 최종 화면을 시각 검토했다.
- 한·영 × 라이트·다크 × 320/1440px: 528개 조합 통과. 렌더링 오류, 페이지 오류, 0폭 콘텐츠, 문서 가로 넘침을 검사했다.
- 공식 레지스트리에서 독립적으로 만든 CSS와 264개 조합을 비교했다. 계산 스타일 차이 0건. 이 검사는 동일 DOM의 스타일을 비교하며, 구성의 적절성은 별도 시각·상호작용 검사로 확인한다.
- 동작이 있는 53개 계열: 기존 9개 계열 및 추가 44개 계열의 한·영 88개 사례 통과. 나머지 13개는 표시용 계열로 검토했다.
- 옵션 편집기 64개 조합에서 모든 선택값, JSON 동기화, 초기화를 확인했다. IME, 빠른 변경, 직접 링크, 키보드, 반응형 포커스, JavaScript 비활성화, 로딩 실패 후 복구도 통과했다. 오래된 `.source-code` 포커스 검증은 실제 ScrollArea viewport로 바로잡았다.
- 문서 타입 검사 오류·경고 0건, 한·영 setup.ts/view.json 132쌍 타입 검사 통과. Svelte UI 타입 검사와 배포 패키지 소비자 타입·브라우저 검증도 통과했다.
- 정적 사이트 331페이지 빌드 통과. 기존 LayerChart 미사용 import 경고와 site 미설정 sitemap 경고는 남아 있다.

검사 스크립트: `apps/docs/scripts/verify-preview-design.mjs`, `verify-shadcn-fidelity.mjs`, `verify-component-options.mjs`, `verify-component-demos.mjs`, `verify-component-setup.mjs`.

전체 캡처·검증 기록은 로컬 `~/.gstack/projects/miinhlym-viewstem/designs/design-audit-20261106/runtime-preview/`에 보관한다. 리뷰 단계에서는 기존 작업을 보존했고 커밋하지 않았다.

선택형 Impeccable 0.1.3 검사도 설치·실행했다. 66개 DOM에서 나온 380개 휴리스틱 경고를 5종으로 묶어 검토했으며 NavigationMenu의 실제 내부 잘림을 추가 수정했다. 차트 tooltip은 body portal이며 탭의 실제 대비는 약 5.11:1로, 해당 경고는 실제 결함으로 재현되지 않았다. 원본 컴포넌트의 구조·애니메이션을 일반적인 휴리스틱에 맞춰 재디자인하지 않았다.

## 후속 커밋 전 검증

2026-11-06 미커밋 변경을 목적별로 나누는 과정에서 전체 UI 검사를 다시 실행했다. DataTable 공개 labels 계약 변경 뒤 감사 행렬의 support SHA-256 동기화가 누락되어 `audit:matrix` 생성기로 갱신했다. 공개 부품·동작 사례 목록은 바뀌지 않았다. 이후 생성 소스·CSS·감사 행렬 재현 검사와 UI 브라우저 테스트 111개가 통과했다. 격리된 배포 패키지 소비자의 엄격한 타입 검사와 브라우저 ESM 검사도 다시 통과했다. CI 도구 테스트 14개, actionlint, Starlight i18n 8개 시나리오와 루트·사이트 manifest/lockfile 일치도 확인했다. 사이트의 기존 화면·타입·빌드 검증은 제품 코드가 동일한 범위에서 재사용했다.
