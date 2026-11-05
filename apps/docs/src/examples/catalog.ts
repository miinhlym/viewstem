import type { ExampleId, Locale } from './definitions';

type Translation = readonly [en: string, ko: string];
type Experiment = { file?: 'resources' | 'inputs'; find: string; instruction: Translation };
type Lesson = {
  id: ExampleId;
  title: Translation;
  concept: string;
  explanation: Translation;
  check: Translation;
  experiment: Experiment;
};
type Stage = { title: Translation; lessons: readonly Lesson[] };

export const stages: readonly Stage[] = [
  { title: ['View basics', 'View 기초'], lessons: [
    { id: 'first-view', title: ['Render a button from JSON', 'JSON으로 버튼 하나 그리기'], concept: 'render · componentRef',
      explanation: ['The render field describes what the View displays. Here, componentRef selects the registered shadcn.Button.', 'render는 View가 화면에 표시할 내용을 정의합니다. 여기서는 componentRef가 등록된 shadcn.Button을 가리킵니다.'],
      check: ['The preview starts with a single Hello, Viewstem button.', '실행 결과에 ‘안녕, Viewstem’ 버튼 하나가 표시됩니다.'],
      experiment: { find: '"componentRef":', instruction: [
        'Change componentRef from "shadcn.Button" to "shadcn.Badge". The greeting stays the same and now renders as a badge.',
        'componentRef를 "shadcn.Button"에서 "shadcn.Badge"로 바꿔 보세요. 인사말은 그대로이고 버튼 대신 배지가 표시됩니다.',
      ] } },
    { id: 'component-inputs', title: ['Configure a button with inputs', 'inputs로 버튼 설정하기'], concept: 'inputs',
      explanation: ['The same shadcn.Button accepts text, variant, and disabled in its inputs. Each input controls one aspect of that button.', '같은 shadcn.Button에서 inputs의 text는 문구를, variant는 모양을, disabled는 사용 가능 여부를 정합니다.'],
      check: ['The Draft button has an outline and cannot be clicked.', '테두리가 있는 초안 버튼이 표시되고 클릭할 수 없습니다.'],
      experiment: { find: '"disabled":', instruction: [
        'Change disabled from true to false. The outlined button becomes enabled.',
        'disabled를 true에서 false로 바꿔 보세요. 테두리 버튼이 활성화됩니다.',
      ] } },
    { id: 'slots', title: ['Put badges inside a card', '카드 슬롯에 배지 넣기'], concept: 'slots.default',
      explanation: ['Pass the two badge nodes to the default slot of Card.Content. Their order in the array sets their display order.', 'Card.Content의 기본 슬롯에 배지 노드 두 개를 넘깁니다. 배열에 적은 순서대로 배지가 표시됩니다.'],
      check: ['The card shows Draft before Saved, matching the order in the slot.', '카드에 슬롯에 적은 순서대로 초안과 저장됨이 표시됩니다.'],
      experiment: { find: '"id": "draft"', instruction: [
        'Swap the draft and saved objects in Card.Content’s slots.default array. Both badges stay in the card, in the new order.',
        'Card.Content의 slots.default 배열에서 draft와 saved 객체의 순서를 바꿔 보세요. 두 배지가 카드 안에서 새 순서로 표시됩니다.',
      ] } },
    { id: 'conditions', title: ['Show a node with when', 'when으로 표시 조건 정하기'], concept: 'when',
      explanation: ['A node with when appears only if the condition evaluates to true. Without when, the node appears by default.', 'when을 지정한 노드는 조건이 true일 때만 표시됩니다. when을 생략하면 기본으로 표시됩니다.'],
      check: ['Both badges are declared in the JSON. The preview shows only Draft because the Saved node has when set to false.', 'JSON에는 배지 두 개가 있지만, 저장됨 노드의 when이 false라서 초안만 표시됩니다.'],
      experiment: { find: '"when": false', instruction: [
        'Change the Saved node’s when from false to true. Both badges appear.',
        '저장됨 노드의 when을 false에서 true로 바꿔 보세요. 두 배지가 모두 표시됩니다.',
      ] } },
    { id: 'repeat', title: ['Render one badge per item', '목록 항목마다 배지 그리기'], concept: 'repeat · key',
      explanation: ['repeat renders the same node once per item. Here, as names each item project, and key uses its unique ID to keep track of it.', 'repeat는 항목마다 같은 노드를 하나씩 그립니다. as로 각 항목을 project라는 이름으로 읽고, key에는 항목의 고유 ID를 사용합니다.'],
      check: ['One badge appears for Onboarding and one for Billing.', '온보딩과 결제 배지가 각각 하나씩 표시됩니다.'],
      experiment: { find: '"items":', instruction: [
        'Copy the billing item and give the copy a different name. The duplicate id causes an error. Give the copy a new id to render a third badge.',
        '결제 항목을 복제하고 name만 바꿔 보세요. id가 중복돼 오류가 납니다. 복제한 항목에 새 id를 주면 배지가 세 개 표시됩니다.',
      ] } },
    { id: 'view-inputs', title: ['Read inputs passed to a View', 'View에 전달된 입력 읽기'], concept: 'ports · /ports',
      explanation: ['view.json declares a required string port named title and reads it at /ports/title. inputs.json represents the values the host app passes to mount.', 'view.json은 문자열이 필요한 title 포트를 선언하고 /ports/title에서 읽습니다. inputs.json에는 앱이 mount에 전달할 값이 들어 있습니다.'],
      check: ['The badge displays Projects, the value supplied by the host.', '호스트가 넘긴 프로젝트라는 값이 배지에 표시됩니다.'],
      experiment: { file: 'inputs', find: '"title":', instruction: [
        'Change title in inputs.json. The badge uses the new value from the host.',
        'inputs.json의 title을 다른 이름으로 바꿔 보세요. 새 값이 배지에 표시됩니다.',
      ] } },
    { id: 'port-default', title: ['Use a default input', '입력 생략 시 기본값 쓰기'], concept: 'Value port · default',
      explanation: ['A Value port uses its default when the caller omits the key. Here inputs.json starts as an empty object.', 'Value 포트는 호출자가 키를 생략했을 때 default를 사용합니다. 이 예제의 inputs.json은 빈 객체로 시작합니다.'],
      check: ['The badge starts at Projects, the default declared in view.json.', '배지는 view.json에 선언한 기본값인 프로젝트를 표시합니다.'],
      experiment: { file: 'inputs', find: '{}', instruction: [
        'Set inputs.json to {"title": "Billing"}. The badge shows Billing. Remove the key to see Projects again.',
        'inputs.json을 {"title": "결제"}로 바꿔 보세요. 결제가 표시됩니다. 키를 지우면 다시 프로젝트가 표시됩니다.',
      ] } },
    { id: 'value-call', title: ['Build a label with @call', '@call로 문구 만들기'], concept: '@path · @call',
      explanation: ['The concat function joins a literal prefix and the value read from /ports/title. Its result becomes the badge text.', 'concat 함수는 고정 문구와 /ports/title에서 읽은 값을 이어 붙입니다. 계산 결과가 배지 문구가 됩니다.'],
      check: ['The badge reads Open Projects.', '배지에 열기 · 프로젝트가 표시됩니다.'],
      experiment: { find: '"args":', instruction: [
        'Change the first argument from "Open " to "View ". The title still comes from the same port.',
        '첫 번째 인수인 "열기 · "를 "보기 · "로 바꿔 보세요. 프로젝트 이름은 같은 포트에서 읽습니다.',
      ] } },
  ] },
  { title: ['State and events', '상태와 이벤트'], lessons: [
    { id: 'state', title: ['Render the initial State value', 'State 초기값 표시하기'], concept: 'State · /states',
      explanation: ['The View stores title as State. The badge reads its current value from /states/title, starting with the declared initial value.', 'View는 title을 State에 보관합니다. 배지는 /states/title에서 현재 값을 읽고, 처음에는 선언한 초기값을 표시합니다.'],
      check: ['The badge starts with Draft, which comes from states.title.initial rather than a literal in the badge inputs.', '배지에 처음 표시되는 초안은 배지에 직접 적은 문구가 아니라 states.title.initial에 저장한 값입니다.'],
      experiment: { find: '"initial":', instruction: [
        'Change states.title.initial. The badge starts with your new value.',
        'states.title.initial을 다른 문구로 바꿔 보세요. 배지의 초기 문구가 바뀝니다.',
      ] } },
    { id: 'set-state', title: ['Change State on click', '클릭해서 State 바꾸기'], concept: 'on.click · SetState',
      explanation: ['on.click passes the title State to the Action through a State port. SetState writes to that port, and the badge shows the new value.', 'on.click은 title State를 State 포트로 Action에 연결합니다. SetState가 연결된 State에 값을 쓰면 배지가 새 값을 표시합니다.'],
      check: ['Click Save. The badge changes from Draft to Saved.', '저장을 누르면 배지가 초안에서 저장됨으로 바뀝니다.'],
      experiment: { find: '"kind": "SetState"', instruction: [
        'Change the value in the SetState step. Click Save in the preview to see your new label.',
        'SetState 단계의 value를 바꾼 뒤 실행 결과에서 저장을 누르세요. 배지에 새 문구가 표시됩니다.',
      ] } },
    { id: 'event-payload', title: ['Read typed text from an event', '입력 이벤트에서 텍스트 읽기'], concept: '/event/value',
      explanation: ['on.input reads the typed text at /event/value and passes it as next. The Action reads /ports/next and writes it to the State that the badge displays.', 'on.input은 /event/value에서 입력한 글자를 읽어 next로 넘깁니다. Action은 /ports/next에서 그 값을 받아 배지에 표시할 State에 씁니다.'],
      check: ['Type into Project name. The badge shows the text the Action receives.', '프로젝트 이름 입력란에 글자를 써 보세요. 배지에 Action이 받은 글자가 표시됩니다.'],
      experiment: { find: '"/event/value"', instruction: [
        'In on.input.inputs.next, replace {"@path": "/event/value"} with "Fixed". Type again. The field keeps what you type, and the badge shows Fixed.',
        'on.input의 inputs.next에서 {"@path": "/event/value"}를 "고정"으로 바꾸고 다시 입력해 보세요. 입력란에는 타이핑한 글자가 남고, 배지에는 Action이 받은 고정 문구가 표시됩니다.',
      ] } },
    { id: 'conditional-ui', title: ['Show and hide content with State', 'State로 내용 표시하고 숨기기'], concept: 'checkedChange · when',
      explanation: ['The switch updates enabled through checkedChange. The details badge reads that same State in its when condition.', '스위치가 checkedChange 이벤트에서 enabled를 갱신합니다. 세부 정보 배지는 같은 State를 when 조건으로 읽습니다.'],
      check: ['Turn the switch on to show the badge. Turn it off to hide it.', '스위치를 켜면 배지가 나타나고, 끄면 사라집니다.'],
      experiment: { find: '"when": {', instruction: [
        'Replace the badge’s when value {"@path": "/states/enabled"} with true. Flip the switch again. The badge now stays visible when the switch is off.',
        '배지의 when 값 {"@path": "/states/enabled"}를 true로 바꿔 보세요. 스위치를 꺼도 배지가 계속 표시됩니다.',
      ] } },
    { id: 'derived', title: ['Compute a Derived value', 'Derived로 값 계산하기'], concept: 'Derived · Variable · CEL',
      explanation: ['Derived calculates a label with a CEL expression whenever title changes. The outline badge shows title and the solid badge shows the calculated label.', 'Derived는 title이 바뀔 때마다 CEL 식으로 이름의 길이를 판정합니다. 테두리 배지는 원래 이름을, 채운 배지는 계산 결과를 표시합니다.'],
      check: ['Click Use a longer name. The input changes from Task to Project plan, and the result changes from Short name to Long name.', '긴 이름으로 변경을 누르면 입력이 업무에서 프로젝트 계획으로 바뀌고, 계산 결과는 짧은 이름에서 긴 이름으로 바뀝니다.'],
      experiment: { find: '"expression":', instruction: [
        'Raise the threshold in size(title) > 5 to 30 and click Use a longer name. The input changes, but the new rule still classifies it as Short name.',
        'size(title) > 5의 기준을 30으로 올리고 긴 이름으로 변경을 누르세요. 원래 이름은 바뀌지만 새 기준에서는 여전히 짧은 이름입니다.',
      ] } },
    { id: 'state-reaction', title: ['Reset State when another value changes', '다른 State가 바뀌면 선택 초기화하기'], concept: 'reactions · watch',
      explanation: ['The reaction watches the current project. When that State changes, it writes a fixed value to the selection State.', 'reaction은 현재 프로젝트를 감시합니다. 프로젝트 State가 바뀌면 선택 State에 정해 둔 값을 씁니다.'],
      check: ['Click Open Billing. The project changes and Row selected becomes No selection.', '결제 열기를 누르면 프로젝트가 바뀌고 행 선택됨이 선택 없음으로 바뀝니다.'],
      experiment: { find: '"reactions":', instruction: [
        'Change the reaction value to "Cleared". Click Open Billing again after the preview reloads. The selection now reads Cleared.',
        'reaction의 value를 "선택 해제"로 바꾸고 실행 결과에서 결제 열기를 누르세요. 선택 상태에 선택 해제가 표시됩니다.',
      ] } },
  ] },
  { title: ['Actions', '액션'], lessons: [
    { id: 'action-ref', title: ['Call a registered Action', '등록한 Action 호출하기'], concept: 'Action · actionRef',
      explanation: ['resources.json defines the save-draft Action. The button in view.json calls it using actionRef on click.', 'resources.json에 save-draft Action을 정의합니다. view.json의 버튼은 클릭 시 actionRef로 그 Action을 호출합니다.'],
      check: ['Click Save. The registered Action updates the badge to Saved.', '저장을 누르면 등록한 Action이 배지를 저장됨으로 바꿉니다.'],
      experiment: { find: '"actionRef":', instruction: [
        'Change actionRef from "save-draft" to "missing". The reference error shows that the ID must match an Action in resources.json. Restore "save-draft" and click Save again.',
        'actionRef를 "save-draft"에서 "missing"으로 바꾸면 참조 오류가 납니다. resources.json에 등록한 ID인 "save-draft"로 되돌린 뒤 저장을 다시 눌러 보세요.',
      ] } },
    { id: 'action-branch', title: ['Branch an Action with If', 'If로 Action 실행 분기하기'], concept: 'If',
      explanation: ['If reads the switch state. It runs then when the value is true and else when it is false.', 'If가 스위치 상태를 읽습니다. true면 then, false면 else의 단계가 실행됩니다.'],
      check: ['Click Check setting with the switch off, then on. The badge reads Disabled and Enabled respectively.', '스위치를 끈 상태와 켠 상태에서 각각 설정 확인을 누르면 배지에 꺼짐과 켜짐이 표시됩니다.'],
      experiment: { find: '"condition":', instruction: [
        'Replace If’s condition object {"@path": "/ports/enabled"} with true. Keep the switch off and click Check setting. The badge says Enabled because If now runs then every time.',
        'If의 condition 값 {"@path": "/ports/enabled"}를 true로 바꾸세요. 스위치를 끈 채 설정 확인을 눌러도 then이 실행되어 켜짐이 표시됩니다.',
      ] } },
    { id: 'action-assert', title: ['Stop an Action with Assert', 'Assert로 저장 조건 검사하기'], concept: 'Assert',
      explanation: ['Assert stops the Action when its condition is false. Later steps run only after the check passes.', 'Assert 조건이 false면 Action을 중단합니다. 검사를 통과해야 뒤의 단계가 실행됩니다.'],
      check: ['With Allow saving off, click Save. The error appears and Draft stays. Turn it on and save again to see Saved.', '저장 허용을 끈 채 저장을 누르면 오류가 표시되고 초안이 유지됩니다. 스위치를 켜고 다시 저장하면 저장됨으로 바뀝니다.'],
      experiment: { find: '"condition":', instruction: [
        'Replace Assert’s condition object {"@path": "/ports/enabled"} with true. Click Save with Allow saving off. The check now passes and the badge changes to Saved.',
        'Assert의 condition 값 {"@path": "/ports/enabled"}를 true로 바꾸세요. 저장 허용을 끈 채 저장을 눌러도 검사를 통과해 저장됨이 표시됩니다.',
      ] } },
    { id: 'action-output', title: ['Pass an Action result to the next step', 'Action 결과를 다음 단계에 전달하기'], concept: 'Action step · output · /steps',
      explanation: ['The make-label Action returns output.value. The calling Action names that step label and reads its result at /steps/label in SetState.', 'make-label Action은 output.value를 반환합니다. 호출하는 Action은 이 단계에 label이라는 ID를 붙이고 SetState에서 /steps/label로 결과를 읽습니다.'],
      check: ['Click Save. The badge changes from Draft to Saved.', '저장을 누르면 배지가 초안에서 저장됨으로 바뀝니다.'],
      experiment: { file: 'resources', find: '"output":', instruction: [
        'In resources.json, change the Action output value to "Reviewed". Click Save to see Reviewed without changing the caller.',
        'resources.json에서 Action의 output.value를 "검토됨"으로 바꾸세요. 호출 코드는 그대로 두고 저장을 누르면 검토됨이 표시됩니다.',
      ] } },
    { id: 'action-status', title: ['Display an Action’s execution status', 'Action 실행 상태 표시하기'], concept: '/actions · status',
      explanation: ['The badge reads the status of the check-action click binding. This is the binding ID used for observation.', '배지는 클릭 연결에 붙인 ID인 check-action으로 실행 상태를 읽습니다.'],
      check: ['The badge starts at idle. Clicking Run check changes it to success.', '처음에는 idle이 표시되고 검사 실행을 누르면 success로 바뀝니다.'],
      experiment: { find: '"condition":', instruction: [
        'Change the Assert condition from true to false. Clicking Run check now shows error.',
        'Assert의 condition을 true에서 false로 바꿔 보세요. 검사 실행을 누르면 error가 표시됩니다.',
      ] } },
    { id: 'action-variable', title: ['Calculate a value inside an Action', 'Action 안에서 Variable 계산하기'], concept: 'Variable step · /steps',
      explanation: ['The Variable step calculates text with CEL. The next step reads /steps/marked and stores the result in State.', 'Variable 단계가 CEL로 문구를 계산합니다. 다음 단계는 /steps/marked의 결과를 읽어 State에 저장합니다.'],
      check: ['Click Add a mark. The badge changes from Projects to Projects!.', '기호 붙이기를 누르면 프로젝트가 프로젝트!로 바뀝니다.'],
      experiment: { find: '"expression":', instruction: [
        'Replace "!" with "?" in the Variable expression. Click Add a mark to get Projects?.',
        'Variable 식에서 "!"를 "?"로 바꾸세요. 기호 붙이기를 누르면 프로젝트?가 표시됩니다.',
      ] } },
  ] },
  { title: ['Queries and data', '쿼리와 데이터'], lessons: [
    { id: 'query-result', title: ['Read a Query result', 'Query 결과 읽기'], concept: 'Query · /queries',
      explanation: ['The projects Query returns its transform.input without an HTTP request. The badge reads the result at /queries/projects/data.', 'projects Query는 HTTP 요청 없이 transform.input의 값을 반환합니다. 배지는 /queries/projects/data에서 결과를 읽습니다.'],
      check: ['The badge shows Projects from the Query.', '배지에 Query 결과인 프로젝트가 표시됩니다.'],
      experiment: { find: '"/queries/projects/data"', instruction: [
        'Change the badge’s text from {"@path": "/queries/projects/data"} to "Fixed". Then change transform.input. The badge keeps Fixed because it no longer reads the Query result.',
        '배지의 text 값 {"@path": "/queries/projects/data"}를 "고정"으로 바꾼 뒤 transform.input도 바꿔 보세요. 배지는 Query 결과를 읽던 연결이 끊겨 고정 문구를 유지합니다.',
      ] } },
    { id: 'query-inputs', title: ['Rerun a Query when inputs change', '입력이 바뀌면 Query 다시 실행하기'], concept: 'Query inputs',
      explanation: ['The outline badge reads title State. The solid badge reads the Query result. The Query reruns when the title passed to its Value port changes.', '테두리 배지는 title State를, 채운 배지는 Query 결과를 표시합니다. Query는 Value 포트로 전달받은 title이 바뀌면 다시 실행됩니다.'],
      check: ['Click Rename. Both badges change from Projects to Renamed because the Query receives the new State value.', '이름 변경을 누르면 두 배지가 모두 프로젝트에서 이름 변경됨으로 바뀝니다. Query가 새 State 값을 받기 때문입니다.'],
      experiment: { find: '"/states/title"', instruction: [
        'In queries.projects.inputs, replace title’s {"@path": "/states/title"} with "Fixed query input". Click Rename. The outline badge changes and the Query badge keeps the fixed input.',
        'queries.projects.inputs의 title 값 {"@path": "/states/title"}를 "고정 Query 입력"으로 바꾸세요. 이름 변경을 누르면 테두리 배지만 바뀌고 Query 배지는 고정된 입력을 표시합니다.',
      ] } },
    { id: 'query-ref', title: ['Use a registered Query', '등록한 Query 사용하기'], concept: 'queryRef',
      explanation: ['resources.json defines project-title. view.json uses it through queryRef. The badge reads that use’s result by its local name projects, which can differ from the registered ID.', 'resources.json은 project-title을 정의하고, view.json은 queryRef로 이를 사용합니다. 배지가 읽는 /queries/projects/data의 projects는 View 안에서 붙인 이름입니다.'],
      check: ['The badge reads Projects from the registered Query.', '등록한 Query에서 읽은 프로젝트가 배지에 표시됩니다.'],
      experiment: { file: 'resources', find: '"transform":', instruction: [
        'Edit transform.input in resources.json. The View shows the new result using the same queryRef.',
        'resources.json의 transform.input을 바꿔 보세요. 같은 queryRef로 읽은 새 결과가 표시됩니다.',
      ] } },
    { id: 'http-datasource', title: ['Read a field from an HTTP response', 'HTTP 응답에서 값 읽기'], concept: 'Datasource · /sources',
      explanation: ['datasourceRef selects projects-api from resources.json. The Query sends GET /projects and uses /sources/main/title to read one field from the sample response.', 'datasourceRef가 resources.json의 projects-api를 선택합니다. Query는 GET /projects를 요청하고 샘플 응답에서 /sources/main/title로 title을 읽습니다.'],
      check: ['The badge displays Projects 1 from the response title.', '응답의 title 값인 프로젝트 1이 배지에 표시됩니다.'],
      experiment: { find: '"/sources/main/title"', instruction: [
        'Change /sources/main/title to /sources/main/code. The badge now shows PRJ, another field from the same response.',
        '/sources/main/title을 /sources/main/code로 바꿔 보세요. 같은 응답의 다른 필드인 PRJ가 표시됩니다.',
      ] } },
    { id: 'query-on-click', title: ['Send a POST request on click', '클릭해서 POST 요청 보내기'], concept: 'Query step · POST',
      explanation: ['A Query step inside an Action runs only when the button is clicked. It sends POST /projects, and SetState reads the returned title. The preview uses a sample response.', '버튼을 누르면 Action의 Query 단계가 POST /projects를 요청합니다. SetState는 응답에서 읽은 제목을 저장합니다. 이 예제는 샘플 응답을 사용합니다.'],
      check: ['The badge starts at No project created. Click Create project to see Onboarding, the title returned by the sample API.', '처음에는 만들어진 프로젝트 없음이 표시됩니다. 프로젝트 만들기를 누르면 샘플 API가 반환한 온보딩이 표시됩니다.'],
      experiment: { find: '"body":', instruction: [
        'Change request.body.title to "Billing". Click Create project to see the returned title change.',
        'request.body.title을 "결제"로 바꿔 보세요. 프로젝트 만들기를 누르면 응답으로 받은 결제가 표시됩니다.',
      ] } },
    { id: 'query-gate', title: ['Run a Query only when allowed', '조건이 맞을 때만 Query 실행하기'], concept: 'executeWhen · Query status',
      explanation: ['executeWhen holds the Query until the switch is on. One badge reads status and the other reads data once it exists.', 'executeWhen 조건이 참이 될 때까지 Query는 기다립니다. 배지 하나는 실행 상태를, 다른 하나는 결과가 준비되면 그 값을 표시합니다.'],
      check: ['The preview starts at waiting with no project title. Turn on Allow request to see success and Projects 1.', '처음에는 waiting 상태이고 프로젝트 이름은 비어 있습니다. 요청 허용을 켜면 success와 프로젝트 1이 표시됩니다.'],
      experiment: { find: '"executeWhen":', instruction: [
        'Replace executeWhen’s {"@path": "/states/enabled"} with true. The first request now runs with the switch still off.',
        'executeWhen 값 {"@path": "/states/enabled"}를 true로 바꾸세요. 스위치가 꺼져 있어도 첫 요청이 실행됩니다.',
      ] } },
    { id: 'refresh-query', title: ['Refetch data on click', '버튼으로 Query 다시 요청하기'], concept: 'Query port · RefreshQuery',
      explanation: ['The Action receives /queries/projects, the Query instance, through a Query port. RefreshQuery requests it again without changing its inputs.', 'Action은 Query 포트로 /queries/projects에 있는 Query 인스턴스를 받습니다. RefreshQuery는 입력값이 그대로여도 다시 요청합니다.'],
      check: ['Click Refresh twice. The badge goes from Projects 1 to Projects 2, then Projects 3.', '새로고침을 두 번 누르면 배지가 프로젝트 1 → 프로젝트 2 → 프로젝트 3으로 바뀝니다.'],
      experiment: { find: '"steps":', instruction: [
        'Replace the steps array with []. The button stays visible, and clicking it leaves the number at 1.',
        '새로고침 Action의 steps 배열을 []로 바꿔 보세요. 버튼은 남아 있고, 눌러도 번호가 1에서 바뀌지 않습니다.',
      ] } },
    { id: 'query-polling', title: ['Refresh a Query on an interval', 'Query를 일정 간격으로 갱신하기'], concept: 'intervalMs · autoRefreshWhen',
      explanation: ['intervalMs schedules the next refresh after the previous run finishes. autoRefreshWhen controls automatic refreshes while the first request can still run.', 'intervalMs는 직전 실행이 끝난 뒤 다음 갱신까지의 간격입니다. autoRefreshWhen은 주기 갱신을 제어하며, 처음 요청은 별도로 실행됩니다.'],
      check: ['Projects 1 appears while Auto-refresh is off. Turn it on to refresh immediately and then about every 1.5 seconds. Turn it off to stop refreshing.', '자동 갱신이 꺼져 있어도 프로젝트 1이 표시됩니다. 켜면 즉시 갱신되고 이후 약 1.5초마다 숫자가 바뀝니다. 끄면 갱신을 멈춥니다.'],
      experiment: { find: '"intervalMs":', instruction: [
        'Change intervalMs to 3000. Turn Auto-refresh on and compare the time between updates.',
        'intervalMs를 3000으로 바꾸세요. 자동 갱신을 켜고 숫자가 바뀌는 간격을 비교해 보세요.',
      ] } },
    { id: 'query-concat', title: ['Combine arrays in a Query', 'Query에서 배열 합치기'], concept: 'transform · Concat',
      explanation: ['Concat appends each array listed in with to the input array. The badges render the combined list in order.', 'Concat은 with에 지정한 배열을 입력 배열 뒤에 차례로 붙입니다. 합친 목록의 순서대로 배지가 표시됩니다.'],
      check: ['The preview shows Onboarding from transform.input, then Billing from the first array in Concat.with.', '먼저 transform.input의 온보딩이, 그다음 Concat.with의 첫 배열에 있는 결제가 표시됩니다.'],
      experiment: { find: '"with":', instruction: [
        'Add a new item with a unique id and a name to the array inside Concat.with. It appears after Billing.',
        'Concat.with 안의 배열에 고유한 id와 name이 있는 항목을 추가해 보세요. 결제 다음에 새 배지가 표시됩니다.',
      ] } },
    { id: 'query-join', title: ['Join records by key', '키로 레코드 결합하기'], concept: 'transform · Join',
      explanation: ['The status records are in reverse order. Join matches each project’s id to projectId, so array position does not decide which status a project gets.', '상태 목록은 프로젝트 목록과 순서가 반대입니다. Join은 배열의 위치 대신 프로젝트의 id와 상태의 projectId를 비교해 짝을 찾습니다.'],
      check: ['Onboarding is paired with Saved and Billing with Draft, in project order.', '온보딩에는 저장됨이, 결제에는 초안이 붙어 프로젝트 목록 순서대로 표시됩니다.'],
      experiment: { find: '"projectId": "onboarding"', instruction: [
        'Change the Onboarding status record’s projectId to "missing". With an inner join, only Billing remains because Onboarding has no match.',
        '온보딩 상태 레코드의 projectId를 "missing"으로 바꿔 보세요. 내부 조인에서 온보딩의 짝이 없어 결제 행만 남습니다.',
      ] } },
    { id: 'query-sources', title: ['Combine the results of two Queries', '두 Query의 결과 합치기'], concept: 'sources · nested Query',
      explanation: ['The outer Query runs active and archived as sources. Its transform reads both results through /sources and appends the archived list.', '바깥 Query는 active와 archived를 각각 source로 실행합니다. transform은 /sources에서 두 결과를 읽고 보관 목록을 뒤에 붙입니다.'],
      check: ['The preview shows Onboarding from active, followed by Billing from archived.', 'active에서 온 온보딩 다음에 archived에서 온 결제가 표시됩니다.'],
      experiment: { find: '"with":', instruction: [
        'Replace the Concat with array with []. Both source definitions stay in place, and the result now contains only the active list.',
        'Concat의 with 배열을 []로 바꾸세요. source 정의 두 개는 그대로이고, 결과에는 active 목록만 남습니다.',
      ] } },
  ] },
  { title: ['Reuse', '정의 재사용'], lessons: [
    { id: 'reusable-component', title: ['Reuse a declared Component', '선언한 Component 재사용하기'], concept: 'Component · componentRef',
      explanation: ['resources.json defines project-label once. Two nodes use that same Component through componentRef and pass different values to its name port.', 'resources.json에 project-label을 한 번 정의합니다. 두 노드가 componentRef로 같은 Component를 사용하면서 name 포트에는 서로 다른 값을 넘깁니다.'],
      check: ['Both badges come from project-label. Each displays its own name.', '두 배지 모두 project-label을 사용하며 각자 받은 이름을 표시합니다.'],
      experiment: { file: 'resources', find: '"variant":', instruction: [
        'Change the shared Badge variant from "secondary" to "outline". Both badges change style and keep their own names.',
        '공유 Badge의 variant를 "secondary"에서 "outline"으로 바꿔 보세요. 두 배지의 모양은 함께 바뀌고 이름은 각자 유지됩니다.',
      ] } },
    { id: 'inline-component', title: ['Define a Component inline', '사용하는 곳에 Component 정의하기'], concept: 'component · ports',
      explanation: ['The node’s component object defines a Component at its use site. Its inputs still bind to the Component’s public ports.', '노드의 component에 Component를 바로 정의합니다. 노드의 inputs는 별도 등록한 Component에서와 같이 공개 포트에 연결됩니다.'],
      check: ['The inline Component reads its name port and displays Onboarding.', '인라인 Component가 name 포트를 읽어 온보딩을 표시합니다.'],
      experiment: { find: '"name": "', instruction: [
        'Change the outer node’s inputs.name to "Billing". The inner render node now displays Billing.',
        '바깥 노드의 inputs.name을 "결제"로 바꾸세요. 내부 render 노드가 결제를 표시합니다.',
      ] } },
    { id: 'component-state', title: ['Keep State separate per Component instance', 'Component 인스턴스마다 상태 갖기'], concept: 'Component · local State',
      explanation: ['Both buttons use the same registered Component. Each instance owns its own title State.', '두 버튼은 같은 등록 Component를 사용합니다. 각 인스턴스가 자기 title State를 가집니다.'],
      check: ['Click the first Draft button. Only that button changes to Saved.', '첫 번째 초안 버튼을 누르세요. 누른 버튼만 저장됨으로 바뀝니다.'],
      experiment: { file: 'resources', find: '"initial":', instruction: [
        'Change the Component’s initial value to "Ready" in resources.json. Both buttons start at Ready again, and clicking one still changes only that instance.',
        'resources.json에서 Component State의 initial을 "준비"로 바꾸세요. 둘 다 준비로 시작하지만 하나를 눌러도 다른 쪽은 그대로입니다.',
      ] } },
    { id: 'shared-state-port', title: ['Share State through a Component port', 'State 포트로 상태 공유하기'], concept: 'Component · State port',
      explanation: ['The View passes the same title State to both Components. Their State ports point to the same writable value.', 'View가 같은 title State를 두 Component에 전달합니다. 두 State 포트가 쓰기 가능한 같은 값을 가리킵니다.'],
      check: ['Click either Draft button. Both change to Saved.', '초안 버튼 중 하나를 누르면 둘 다 저장됨으로 바뀝니다.'],
      experiment: { find: '"id": "second"', instruction: [
        'In the second node’s inputs.title, change /states/title to /states/other. Click the first button again. The second now reads and writes a separate State.',
        '두 번째 노드의 inputs.title에서 /states/title을 /states/other로 바꾸세요. 첫 번째 버튼을 누르면 두 번째 버튼은 별도 State를 사용해 초안으로 남습니다.',
      ] } },
    { id: 'forward-slot', title: ['Forward a slot to another component', '슬롯을 다른 컴포넌트로 전달하기'], concept: 'Component slots · /slots',
      explanation: ['The View fills project-panel’s public body slot. The Component forwards that content to Card.Content’s default slot through /slots/body.', 'View가 project-panel의 공개 body 슬롯을 채웁니다. Component는 /slots/body로 받은 내용을 Card.Content의 기본 슬롯에 전달합니다.'],
      check: ['The Onboarding badge provided by the View appears inside the reusable card.', 'View가 넘긴 온보딩 배지가 재사용 카드 안에 표시됩니다.'],
      experiment: { file: 'resources', find: '"/slots/body"', instruction: [
        'Replace the {"@path": "/slots/body"} object with []. The card still renders, and the badge passed into body disappears.',
        '{"@path": "/slots/body"} 객체를 []로 바꿔 보세요. 카드는 남아 있고 body에 넣은 배지는 사라집니다.',
      ] } },
    { id: 'component-event', title: ['Send an event from a Component to its caller', 'Component 이벤트를 호출자에게 보내기'], concept: 'events · emit · payload',
      explanation: ['The child turns its button click into a public select event with a title payload. The View handles on.select and stores /event/title.', '자식은 버튼 클릭을 title 데이터가 담긴 공개 select 이벤트로 전달합니다. View는 on.select에서 /event/title을 읽어 선택값에 저장합니다.'],
      check: ['Click Pick Onboarding. The View’s selection badge changes to Onboarding.', '온보딩 선택을 누르면 View의 선택 배지에 온보딩이 표시됩니다.'],
      experiment: { file: 'resources', find: '"payload":', instruction: [
        'Change emit’s payload.title to "Billing" in resources.json. Click the same button. The View now shows Billing.',
        'resources.json에서 emit과 함께 선언한 payload.title을 "결제"로 바꾸세요. 같은 버튼을 누르면 View에 결제가 표시됩니다.',
      ] } },
    { id: 'variable-ref', title: ['Reuse a registered Variable', '등록한 Variable 재사용하기'], concept: 'Variable · variableRef',
      explanation: ['Two Derived values reference the same Variable by ID. Each supplies its own title, and both run the same CEL expression.', '두 Derived 값이 같은 Variable을 ID로 참조합니다. 각각 다른 title을 넘기고 같은 CEL 식으로 계산합니다.'],
      check: ['Both Projects! and Billing! use the exclamation mark from the registered Variable.', '프로젝트!와 결제!는 모두 등록된 Variable에서 느낌표를 붙인 결과입니다.'],
      experiment: { file: 'resources', find: '"expression":', instruction: [
        'Replace "!" with "?" in the registered expression. Both badges get the new suffix and keep their own title.',
        '등록한 expression에서 "!"를 "?"로 바꿔 보세요. 두 배지의 끝 기호가 함께 바뀌고 이름은 각자 유지됩니다.',
      ] } },
    { id: 'shared-type', title: ['Validate two inputs with one Type', 'Type 하나로 입력 두 개 검증하기'], concept: 'Type · typeRef',
      explanation: ['The title and next ports both reference project-status. The enum in resources.json limits both to Draft or Saved.', 'title과 next 포트는 모두 project-status를 참조합니다. resources.json의 enum이 두 포트에 초안과 저장됨만 허용합니다.'],
      check: ['The two badges show Saved and Draft, the values supplied in inputs.json.', '두 배지는 inputs.json에 지정한 저장됨과 초안을 순서대로 표시합니다.'],
      experiment: { file: 'inputs', find: '"next":', instruction: [
        'Set next to "Unknown" in inputs.json and see the validation error. Add "Unknown" to the enum in resources.json. Now either port can accept it.',
        'inputs.json의 next를 "미정"으로 바꿔 오류를 확인하세요. resources.json의 enum에 "미정"을 추가하면 두 포트 모두 이 값을 받을 수 있습니다.',
      ] } },
  ] },
];

export const lessons = stages.flatMap(stage => stage.lessons);
export const localize = (locale: Locale, value: Translation) => value[locale === 'ko' ? 1 : 0];

export const exampleCopy = {
  en: {
    title: 'Examples', description: 'Start with one node, then add state, actions, and data one feature at a time.',
    stages: 'Learning stages', run: 'Run example', running: 'Running…', reset: 'Reset code', preview: 'Preview',
    expect: 'What to look for', tryEdit: 'Try an edit', openCode: 'Show in', autoRun: 'Runs on edit',
    toPreview: 'Jump to preview', toCode: 'Back to code',
    source: 'Example workspace', sourceFiles: 'Source files', setup: 'Run in your app', quickstart: 'Quick Start',
    navigation: 'Example navigation', previous: 'Previous example', next: 'Next example',
    error: 'The example could not run.', retained: 'Showing the last successful result.', editorError: 'The editor could not load.',
  },
  ko: {
    title: '예제', description: '노드 하나부터 시작해 상태, 액션, 데이터를 기능별로 하나씩 익혀 보세요.',
    stages: '학습 단계', run: '예제 실행', running: '실행 중…', reset: '코드 초기화', preview: '실행 결과',
    expect: '확인할 동작', tryEdit: '직접 바꿔 보기', openCode: '코드에서 보기', autoRun: '수정 시 자동 실행',
    toPreview: '결과로 이동', toCode: '코드로 돌아가기',
    source: '예제 편집 및 실행', sourceFiles: '소스 파일', setup: '내 앱에서 실행하기', quickstart: '빠른 시작',
    navigation: '예제 이동', previous: '이전 예제', next: '다음 예제',
    error: '예제를 실행하지 못했습니다.', retained: '마지막으로 성공한 결과를 표시합니다.', editorError: '편집기를 불러오지 못했습니다.',
  },
} as const;
