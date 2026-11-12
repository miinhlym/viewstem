# shadcn-svelte 컴포넌트 예제 비교

아래는 D141 적용 시점의 기록이다. 이후 [D142](../../../../docs/history/decision-register.md#a-현재-채택한-결정)에서 대표 예제 하나를 미리보기·JSON 탭에 남겼다.

Chrome에서 [공식 컴포넌트 목록](https://www.shadcn-svelte.com/docs/components)을 열고 66개 상세 경로를 순회했다. 인라인 미리보기 438개의 구성과 추가 예제 제목을 확인했다. Sidebar는 별도 iframe의 아이콘 축소 예제를 확인했다. 아래 수치는 페이지에서 관찰한 인라인 미리보기 수다.

| 범위 | 공식 페이지에서 관찰한 미리보기 수 |
| --- | --- |
| Accordion–Calendar | Accordion 6, Alert 5, Alert Dialog 6, Aspect Ratio 3, Attachment 6, Avatar 9, Badge 6, Breadcrumb 6, Bubble 9, Button 14, Button Group 11, Calendar 8 |
| Card–Dropdown Menu | Card 5, Carousel 6, Chart 6, Checkbox 7, Code Block 23, Collapsible 4, Combobox 7, Command 5, Context Menu 10, Data Table 1, Date Picker 7, Dialog 5, Drawer 6, Dropdown Menu 12 |
| Empty–Native Select | Empty 6, Field 12, Hover Card 3, Input 14, Input Group 13, Input OTP 9, Item 10, Kbd 5, Label 2, Marker 8, Menubar 5, Message 6, Message Scroller 11, Native Select 4 |
| Navigation Menu–Skeleton | Navigation Menu 1, Pagination 3, Popover 4, Progress 3, Questionnaire 14, Radio Group 6, Range Calendar 1, Resizable 3, Scroll Area 2, Select 5, Separator 4, Sheet 3, Sidebar iframe 1, Skeleton 6 |
| Slider–Typography | Slider 6, Sonner 4, Spinner 7, Switch 6, Table 3, Tabs 5, Textarea 5, Toggle 5, Toggle Group 7, Tooltip 4, Trace 16, Typography 14 |

Chrome에서 기본 예제의 컨트롤을 직접 조작해 확인한 상태에는 Accordion·Collapsible 펼침, Dialog·Alert Dialog·Drawer·Sheet 열기, Context Menu 오른쪽 클릭, 메뉴와 하위 그룹 표시, Combobox·Command 검색, Select·Native Select, 체크·스위치·토글, Slider·Resizable 키보드 조작, Sidebar 축소, Hover Card·Tooltip 표시가 포함된다. 각 페이지의 모든 변형에서 모든 상호작용과 애니메이션을 재현한 검증 범위는 아니다.

상세 페이지 예제는 공식 미리보기의 배치와 계열별 너비를 참고했다. [View JSON 정의](../../src/examples/component-reference-demos.mjs)

남은 범위는 공식 사이트의 나머지 변형과 일부 기본 예제의 세부 기능이다. Data Table의 열 표시 메뉴와 행 메뉴, Code Block의 줄바꿈 및 내려받기, Message Scroller의 응답 스트리밍, Sidebar의 전체 탐색 메뉴, Slider의 범위와 다중 핸들은 새 예제에서 재현하지 않았다. 장식 아이콘·문구·데이터·사이트 테마가 달라 픽셀 일치를 보장하지 않는다.
