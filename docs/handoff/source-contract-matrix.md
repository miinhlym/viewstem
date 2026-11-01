# 원문에서 현재 계약으로의 대조표

> 후속 현재 결정: U13에서 원문 복원과 별개로 O01–O16의 세부 계약을 위임 판단했다. U14에서는 Q1–Q3 추천안을 사용자가 수락해 D68–D70으로 확정했다. 아래 표의 원문 감사 시점 미결 설명은 [현재 처리 현황](open-contracts.md#o01o16-전체-처리-현황)으로 갱신해 읽는다. 과거 제안을 최초 승인으로 소급한 것이 아니다.

기준일: 2026-10-29. [현재 명세](../VIEWSTEM-SPEC.md)와 [근거 색인](../history/evidence-index.md)에 연결하는 **설계 의미의 추적표**다. 원문의 제안·수락·예외·이후 대체를 함께 읽고, 같은 E번호를 인용했다는 이유만으로 요약의 완전성을 가정하지 않는다. [열린 상세](open-contracts.md)는 승인된 기능을 구현 가능한 계약으로 옮길 작업이며 새 기능 승인서가 아니다.

## 실제 대조 범위와 한계

이번 원문 감사는 담당 범위를 나눈 검토자들이 아래 보존 파일의 **실제 메시지 본문을 순서대로 전부 읽은 합계 1,530개**를 분모로 삼았다. 인용된 ID만 검색해 읽은 수량이 아니다. 한 검토자가 혼자 1,530개를 읽었다는 뜻도 아니다. 관련 주제의 후속 변경은 다른 구간까지 추가 대조했다.

| 구간 | 보존 transcript 파일 범위 | 본문 읽기 완료 |
|---|---|---:|
| S1 | 10/08-01, 10/12-01, 10/14-01·02 | 158 / 158 |
| S2 | 10/16-01·02, 10/19-01, 10/20-01·02 | 194 / 194 |
| S3 | 10/21-01·02·03, 10/23-01 | 270 / 270 |
| S4 | 10/23-02·03, 10/26-01·02 | 263 / 263 |
| S5 | 10/26-03·04·05·06 | 251 / 251 |
| S6 | 10/27-01·02·03·04·05, 10/28-01 | 394 / 394 |
| 합계 | 27개 날짜별 보존 파일 | **1,530 / 1,530** |

이 분모는 **로컬 보존본의 수록 메시지**다. 전체 방 원본 내보내기·삭제/비가시 메시지·첨부 본문·도구 결과까지 완전하다는 뜻은 아니다. 초기 일부 구간은 발췌이며, 예를 들어 `Sentinel_78b64f1614608191a70af3583a414e3b`의 보존 본문은 5절부터 시작한다. 빠진 원문을 추정해 만들지 않는다.

기존에 보관함에서 본문을 찾지 못했던 9개 인용과 최초 적용 완료의 근거는 방 기록에서 **추가 회수·대조**했다. E58–E66, E61과 URL의 `Sentinel_c3f93ce9e94c81919d176599664b79e3` 회수 근거는 1,530개 로컬 transcript 합계에 덧붙여 같은 분모의 메시지처럼 세지 않는다. U01도 현재 프로젝트 명확화이며 과거 transcript에 소급 삽입하지 않는다. 회수 자료의 요약을 원문 전문으로 가장하지 않으며 실제 제안과 사용자 수락 ID를 근거 색인에서 구별한다.

공개 명세·이력·인수인계 전체와 기존 93개 인수 항목을 비교한 뒤 아래 누락 복원 및 추가 인수 사례를 연결했다. 원문 감사 당시 인수 ID는 **미실행 설계 기대값**이었다. 이후의 현재 실행 증거는 [U34–U35 검증 진행표](verification-ledger.md)에 연결한다. JSON 파싱·링크 검사·원문 읽기 완료는 Schema 적합성이나 런타임 테스트 통과가 아니다.

## 22개 주제의 현재 대응

아래 현재 문서 링크는 로컬 원문 보관함 없이도 계약을 이해할 수 있는 공개 설명을 가리킨다. 원문 ID는 대조를 재현하기 위한 식별자이며 계약 해석의 외부 필수 의존성이 아니다. 표의 “구체화”는 기능을 다시 선택할 상태가 아니라 명시한 상세를 닫을 작업이다.

| 주제 | 승인·이유·예외·대체 근거 | 현재 공개 계약 | 인수 기대값·현재 상태 |
|---|---|---|---|
| T01 목표·계층·도메인 독립 | E03 사용자 `Sentinel_2e1af8f6b8ac8191b17a8098b8f5f622`: 서비스 선언 1차·에이전트 2차. E04 `Sentinel_d1a1b95205cc8191af02c36a0ebf543c`, `Sentinel_ea68ed8a3538819195fd713adb46b824`: 공통 정책 독립·JS/Svelte 우선, Dart/Flutter 후속. UI 바닐라 선행이나 Rust 단일 core는 필수 경로 아님 | [main §3](../VIEWSTEM-SPEC.md#3-최상위-확정-결정), [구현 경계](implementation-start.md#2-제품과-의존성-경계) | C07, M07, N01. 방향 확정, 플랫폼별 구현·SDK 구체화 |
| T02 리소스 7종·Type·등록 | E06/E08/E09: `Sentinel_4feca997862c81919ab0b63e46a5eb25`, `Sentinel_423163c8bc4c8191bfcd7cc11c6efb85`, `Sentinel_d1020160f6e08191af078a6290901e5d`. Type은 선택적 구조/제약 재사용; Calculation/DataPipeline 추가 안 함. E10 Theme 제외·Bundle 배열·Layout/Asset 독립 종류 제외. U01은 현재 (kind,id) 명확화 | [리소스·등록](../VIEWSTEM-SPEC.md#4-리소스와-런타임의-확정-구분), [Type](../spec/03-variable-type.md), D04/D37 | C01–C04, C16–C17. 의미 확정, Schema 프로필 구체화 |
| T03 참조·인라인·외피·등록과 실행 | E12 `Sentinel_1f6ceb202e888191bec14431b3d45abe`, `Sentinel_ac75cf2cf6808191942c3dbb25e333a2`: 정의 위치만 다르고 실행 의미 동일. E27 `Sentinel_4c0900f335208191a1efddc71f8c32ef`가 독립 kind/id/name?/spec을 채택. E39 `Sentinel_82e4c0c8de7081919c98dc981aee7911`가 bare 키를 xxxRef로 대체. E13 등록은 실행 아님 | [main §4.1](../VIEWSTEM-SPEC.md#41-정의와-인스턴스), [Action 인라인](../spec/04-action.md#참조-실행과-인라인-실행의-경계), [O01](open-contracts.md) | Q01–Q03, A03, U11, N01–N02. 비 Action 인라인의 현행 배치 매핑은 구체화, node.spec를 임의 확정하지 않음 |
| T04 인스턴스 ID·유지·수명 | E11 `Sentinel_d080abbebc708191bc761061ccf95b83`: 같은 Component 사용은 상태/실행 기본 분리. E14 `Sentinel_4a4f164316c881919eb5c6ff3f838c79`: View/재사용 Component 이름 공간·안정 key·같은 범위 재배치 상태 유지. 부모별·화면 전역 ID 제안은 기본 채택안 아님 | [main §4.2](../VIEWSTEM-SPEC.md#42-인스턴스-식별과-유지-범위), [Component/View](../spec/05-component-view.md) | C07, U05–U07, U12–U13. core 상태 보존 확정, 포커스/스크롤 자동 보존 아님 |
| T05 Port·Type·값과 대상 | E32 `Sentinel_29f36372e92c8191964678bc342f1575`, E34 `Sentinel_7cd3a1ab91988191a0a303514653c764`: Value/State/Query 허용 행렬·inputs·/ports. E39/E41 schema/typeRef 택일·required 경계. Ref/refType/targets/bindings 중간안 대체, access는 후속 | [상태·입력](../VIEWSTEM-SPEC.md#5-상태와-입력의-확정-의미), [타입](../spec/03-variable-type.md), O02–O03 | C01–C06, A02, A25. 정체성·격리 확정, 포트 기본값과 State 계약 호환성 상세 구체화 |
| T06 State/Derived·초기화·완료한 쓰기 | E24→E33 `Sentinel_ba1d44b1b1708191b270490d8c499975`: states 내부 평탄화, initial과 Variable 입력. E67 `Sentinel_d5bfd5004000819180e71fb007d4ca82`: SetState 전체 교체·후속 실패 비롤백. E61 최초 적용의 승인 관찰 의미는 SDK 이름과 구별 | [초기화·수명](../VIEWSTEM-SPEC.md#52-초기화와-수명에서-유지하는-기존-결정), [Action](../spec/04-action.md), [보존 계약](../spec/09-preserved-contracts.md) | C08–C10, A23–A25, N03–N05. 의미 확정, initial 표현·완료 통지 SDK 구체화 |
| T07 reaction | E26 `Sentinel_03a2a84e50cc8191afdd30823b934a14`: 초기 미발화·실제 변경만·명시 배치 선택 우선·그 뒤 Derived/Query. E44 `Sentinel_ba1045bc05ac819190bc7fb37427d50d`: 같은 Store/실제 대상 중복 reaction 거절. 고정 JSON value를 계산식으로 바꾸지 않음 | [main §5.2](../VIEWSTEM-SPEC.md#52-초기화와-수명에서-유지하는-기존-결정), [보존 계약](../spec/09-preserved-contracts.md) | C10–C13. 의미 확정, 새 Action/event 등록 표현만 구체화 |
| T08 Store 주입·관찰 | E51 `Sentinel_6be41f29eb7481918f27592b8a43c707`: 라이브러리 생성 Store 주입·소유 유지. E45 `Sentinel_f2403867ecb88191b5904b65e8b944ba`, `Sentinel_2dc0549b8e9c8191888cb2857208552c`, `Sentinel_9d4ebc2593b08191876dfce26905b9db`: 전체/단일/묶음·values/changes·초기/원자 통지. 임의 외부 Store 자동 지원 아님 | [Store 상세](../spec/09-preserved-contracts.md#statestore-주입의-확정-경계), [관찰](../spec/09-preserved-contracts.md#statestore-관찰의-확정-의미) | C14–C15, S01–S06. removed/null/replaced·해제 의미 확정, 주소/SDK 구체화 |
| T09 URL·baseline·교체 | E46 `Sentinel_17bc982519d88191a6f8008eae95cb87`와 실제 쓰기 직전 검사 `Sentinel_1f6a706416a4819196511a778ffb1054`. 추가 회수 `Sentinel_c3f93ce9e94c81919d176599664b79e3` 및 확인 `Sentinel_35d1829e9d008191bb9b65a9123b11f5`. 후속 정리 `Sentinel_df3ca85a66cc8191a6c68d333a99352e` → 수락 `Sentinel_72f4f5f36bfc81919d39aa88144e0afd`의 기본값 자동 생략 금지도 보존. 고정 baseline·소유 key·State 비롤백·교체 정리 유지, 모든 초기값 기록 의무·SPA 전환 조율로 확대하지 않음 | [URL 상세](../spec/09-preserved-contracts.md#url-동기화의-확정-의미) | L01–L13, M05. 의미 확정, 날짜 codec·수치 한계·SDK 구체화 |
| T10 Query sources·변환·실패 | E06 복합 Query, E49 `Sentinel_9120797d57588191acc40ea62ce36a22` Concat.with, E52 `Sentinel_0b9c6e28808c81919d6c5d08e0744c59` 실패 의미. 필요한 source/단계 실패는 전체 실패·위치 식별; 정상 빈 결과 성공. 형제 sources의 순서를 쓰기 순서로 쓰지 않음 | [Query 상세](../spec/02-query.md), D11/D38 | Q03–Q06, Q14, Q16–Q17, Q20. 결과 의미 확정, Join 전체 필드·추가 변환·오류 DTO 구체화 |
| T11 자동 조회·RefreshQuery·명시 실행·fanout | E29 `Sentinel_bdebcfd344ec8191bc17212e7217a49c`: CRUD Query 정의와 Action 명시 실행. E50 일반 refresh:false, E55 `Sentinel_e533c62c6e348191a13dddf3db0e4cc8` 실행 조건 불가 오류·`Sentinel_982fadb780788191982fb7531cd96c5a` fresh 완료 대기. E64 자동 목록 fanout만 제외. E69 입력 변경 대기 중 유효 결과 재사용·기존 조합 갱신 중 구별 | [Query 사용 인스턴스](../spec/02-query.md#viewcomponent가-소유하는-query-사용-인스턴스), [보존 정책](../spec/09-preserved-contracts.md), O09/O16 | Q07–Q13, Q18–Q19, Q21–Q22. 명시 Action Query에 자동 구독/재시도/캐시/inflight 공유 복원 금지. 제외 결과·매핑만 구체화 |
| T12 실행 위치·현재 요청·인증 | E23 `Sentinel_87abd83415d4819196933076c881b29e` → `Sentinel_66fca7ec4d8c8191a613d4d6adee1302`: 서비스는 리소스를 미리 모름, 현재 정의로 요청 구성. E28 `Sentinel_139a8fd2b27c81918debfec078f47b0c`: secrets/@path/Login·일반 headers/params. 저장 원본 target 필수안·전용 Bearer/ApiKey kind 대체 | [main §6](../VIEWSTEM-SPEC.md#6-query와-실행-환경-계약), [Datasource](../spec/01-datasource-auth.md), O08 | H01–H09. 비밀값 사용권한/목적지와 대상 API 업무 권한 분리 확정, DTO·일부 HTTP 필드 구체화 |
| T13 CEL·값 표현·literal·시간 | E21 `Sentinel_2fdbbfff4bc88191afddfacbfbcd2b3d`와 expression 승인, E22/E31의 @path/@call. E53 `Sentinel_7f08c9648764819181b9a6a68ab9f93b` 시간 재평가, E54 `Sentinel_d6830760f7f481918e8fa618abdba0d7`의 @@. 자체 core 전환이 CEL·값 표현 폐기는 아님 | [Variable](../spec/03-variable-type.md), [값 계약](../spec/10-value-contracts.md), O06–O07 | V01–V04. 의미 확정, clock/함수/실행기·평가 위치 세부 구체화 |
| T14 컬렉션·동등성·격리·snapshot·날짜 | E47 콜백 직전 Set→배열/Map→쌍 배열. E58–E60의 추가 회수 승인: `Sentinel_6251753d31dc8191952863a03596da89`, `Sentinel_4919af5980208191b2636a469a87c7c4`, `Sentinel_48724c8802888191bbeb75871975b389`. 내용/typed 비교와 Set identity·순서 구별, 원본 비동결·안정 읽기·이전 snapshot 보존 | [값 계약](../spec/10-value-contracts.md), [콜백 경계](../spec/09-preserved-contracts.md#query-서비스-콜백의-컬렉션-변환) | C05/C12, S06, Q15, V05–V12. 의미 확정, 나머지 JSON/CEL/Dart 표현 상세 구체화 |
| T15 Action 순차 단계·분기·단언 | E16 `Sentinel_45a63f9db5348191993a436253a68a90`, `Sentinel_c12392b140c08191b8dd2f9523e44250`, `Sentinel_11f0cbb2cb508191bf3fccce471126dd`. E30 호출 XOR, E48 `Sentinel_8a1868ce5b748191b0fa8b7d8a6426e0`, `Sentinel_957e60a4d7d481919e0df05173538050`, `Sentinel_1d9608e595708191ab489ce7c9645540`: strict 조건·분기 범위·Assert 오류 | [Action 상세](../spec/04-action.md), [main §7](../VIEWSTEM-SPEC.md#7-action-실행과-이벤트-연결), O04–O05 | A01–A03, A09–A10, A17–A19. 핵심 확정, Catch/Finally·Action 재귀·Assert.message 상세는 별도 미결 |
| T16 코드 Action·output·void | E42 `Sentinel_f7c1519fb7108191b243dd998f22fc39`, `Sentinel_492bc5c388348191b5974d734032f39a`, `Sentinel_05f1582c5a048191bfaddf51faafe245`: 공통 actionRef·타입 검증 실제 결과·명시 포트. false 정상값, null 명시 타입, output 없음 void. 전체 runtime 자동 주입/샌드박스 보장 아님 | [main §7.1–3](../VIEWSTEM-SPEC.md#71-1차-단계와-결과-계약), [호스트 제안](../spec/07-host-integration.md), O10 | A04–A08, A13. 의미 확정, 등록/핸들/취소 SDK 구체화 |
| T17 on 관찰·입력 실패·호출 폐기 | E43 `Sentinel_c52181383f5481919fd23bc4c4ec71c7`, E42 `Sentinel_1e0ba208250c8191b2d64837265afcb3`: 연결/owner 폐기·늦은 결과 차단·협력 취소. E56 `Sentinel_cc6e873b8fc08191ad357cabd7eac1b2` 선택적 ID·중복 범위. E57 `Sentinel_a20956150cb48191a33b9608ca0622f3` 입력 오류 식별 | [main §7.2](../VIEWSTEM-SPEC.md#72-실행-관찰과-수명), [Action 폐기 상세](../spec/04-action.md#호출-연결이-제거될-때) | A11–A16, A20–A22. 의미 확정, 오류 필드/주소 구체화 |
| T18 Component/View·slots·events·when/repeat | E41: `Sentinel_0dcaf555f408819198d756613cfda982` slots 전용 → `Sentinel_78b2f71a73408191a9d675dd677f2710` 통합 골격. 초기 slots 제외는 대체됨. 공개 events/on.emit, 작성자 문맥·단일 render·strict when·안정 key 유지 | [Component/View](../spec/05-component-view.md), [연결 예시](../spec/06-composition-examples.md), O12 | U01–U07, U11–U13. 중첩 별칭 충돌·같은 노드 when/repeat 평가 순서 구체화 |
| T19 Grid | E41 `Sentinel_860c835663088191b287c83cf066a725`: 직접 노드/반복 템플릿 ID의 inputs.layout, 고정 예약 후 전진 auto 배치. 필수 GridItem·공통 node.layout·x/y/w/h 중간안 대체, dense/밀기·내용 자동 높이·드래그 후속 | [Grid](../spec/05-component-view.md#grid-배치), [예시](../spec/06-composition-examples.md#반복-카드와-grid-연결-예시) | U08–U10. 배치 의미 확정, 실제 픽셀/렌더러 구현 상세 |
| T20 선택 차트 | E62/E63/E65/E66 회수 수락 `Sentinel_95373d3a9f3c8191aa6bb37518cbe251`, `Sentinel_d1afe429b60081919a56289a90f09c8e`, `Sentinel_df3903971fb481918593964d1e681415`, `Sentinel_fe6ef0c3b7b481919e9e5150202f58a0`. 종류·엔진 subset·입력 순서/중복·series ID·데이터 소유·number/null 경계 | [선택 차트 계약](../spec/11-optional-charts.md), O15 | X01–X08. 선택 모듈 의미 확정·미구현, core 자동 설치나 엔진 자동 전환 약속 없음 |
| T21 변경 묶음의 원자성 | E18 제안 `Sentinel_b9b8ba0591f08191badaa785be58acfa` → 사용자 `Sentinel_8abbc6f527dc8191b46729d9ddabfa68`. 코어가 함께 관리하는 State+구성은 전체 검증 후 일괄 반영, 외부 API/DB/외부 Store 제외. 적용 후 Query 실패는 데이터 오류 | [main §8.2](../VIEWSTEM-SPEC.md#82-변경-묶음의-원자성), D30 | M01–M02, S03, N05. 의미 확정·미구현, 변경 프로토콜/충돌 처리 구체화 |
| T22 변경 대상·저장·정의 추종·에이전트 | E17 `Sentinel_46204f7b5e5081918d934bb1fd74fbbd`: 세 변경 모두 지원·서비스 저장 분리. E19 `Sentinel_5b32d36db0d8819193641c576d42d3aa`: 명시 재주입 전 자동 추종 없음. E20 `Sentinel_927c225685888191a7a651537a295a43` 공통 탐색/설명/조작. E05 `Sentinel_43be0d4c56d88191a2bf64b7bcf2d5f5` 화면 core 실행 소유 | [main §8](../VIEWSTEM-SPEC.md#8-변경과-에이전트-연결), [호스트 연결](../spec/07-host-integration.md), O14 | M03–M07. 공용 정의 수정도 지원; 자동 저장·LLM 전체 데이터 주입·별도 에이전트 실행 엔진 아님. SDK/전송 상세 구체화 |

## 앞선 복원과 이번 복원을 구별하기

수정 후 독립 재검토에서 자동 결합의 입력 변경 대기 의미가 추가로 빠진 것을 확인해 E69/D48로 보완했다. `Sentinel_b6aa585ac4648191a550928b2601aeb1` → 사용자 `Sentinel_2802c90c42a08191bf1bdc18e1e0a021`의 범위인 입력 불변 결과 재사용·기존 조합의 갱신 중 구별·관련 결합만 대기를 [Query 상세](../spec/02-query.md#자동-조회-결합의-입력-변경-대기)와 Q22에 연결한다. 실패 후 보존은 O16의 별도 근거 확인이며 명시 Action Query 캐시 금지를 되살리지 않는다.

앞선 9개 복원 E43–E51은 T07–T11/T15/T17에 포함했다. 호출 연결 폐기, reaction 중복, 관찰, URL, 콜백 컬렉션 변환, If/Assert, Concat.with, refresh:false, Store 주입의 **의미는 그대로 유지**한다. 이후 E52의 Query 실패는 T10, U01의 현재 등록 명확화는 T02–T03에 연결한다. U01을 과거 최종 승인의 복원이라고 부르지 않는다.

전체 본문 감사 뒤 추가로 보강한 12개 의미 묶음은 다음과 같다. 날짜·옵션의 옛 문법과 SDK 이름을 함께 복원한 것은 아니다.

| 묶음 | 실제 제안 → 사용자 수락·보충 | 복원 이유와 현재 대응 | 인수 기대값 |
|---|---|---|---|
| R01 시간 입력·재평가 | E53 `Sentinel_e60aa0c782388191b2f3f51302aff276` → `Sentinel_7f08c9648764819181b9a6a68ab9f93b` | CEL 도입으로 기존 시간 연결이 사라지지 않음. [값 계약](../spec/10-value-contracts.md), O06 | V01 |
| R02 literal escape | E54 `Sentinel_322d03b1eb3081919fc8bd1f8136f33e` → `Sentinel_d6830760f7f481918e8fa618abdba0d7`; 자체 문법 유지 `Sentinel_4c5bb104755c8191b3ec620a28cece64` | 일반 path/call과 동적 @@를 구별. 기본 escape 선택을 다시 미결로 만들지 않음 | V02–V04 |
| R03 RefreshQuery 불가·fresh 완료 | E55 `Sentinel_080fb64fa90081919657b1ae696b4c87` → `Sentinel_e533c62c6e348191a13dddf3db0e4cc8`; fresh 대기 수락 `Sentinel_982fadb780788191982fb7531cd96c5a` | 실행 조건 불가의 이유/Action 중단과 새 실행 완료 대기를 보존. refresh:false 제외 결과와 구별 | Q09/Q11, Q18–Q19 |
| R04 on 선택 ID·중복 범위 | E56 `Sentinel_a321183d559881919c2b40f9687f7685` → `Sentinel_20e4dec2408081919f563c8171529baf`; `Sentinel_d24c8f582ca48191a76cf16afd41c6af` → `Sentinel_cc6e873b8fc08191ad357cabd7eac1b2` | 실행 관찰 ID를 노드/정의 ID와 구별, ID 없는 연결도 개별 동시 실행 제한 유지 | A20–A21 |
| R05 입력 실패 진단 | E57 `Sentinel_2b423cb689008191802906129f2e557c` → `Sentinel_a20956150cb48191a33b9608ca0622f3` | steps 0회뿐 아니라 실패 원인·문제 입력 식별 의미도 보존. DTO 필드는 미결 | A22 |
| R06 타입별 동등성 | E58 회수 `Sentinel_1c62cbc88c30819187a6e49a296b5030` → `Sentinel_6251753d31dc8191952863a03596da89` | 객체/배열 내용, Set membership, Map string/number 키와 typed 값 비교를 공개 설명으로 복원 | V05–V07 |
| R07 격리·읽기 snapshot | E59 회수 `Sentinel_de1085b747648191b1a0ec44192810b4` → `Sentinel_4919af5980208191b2636a469a87c7c4`; 확인 `Sentinel_dcfbfb044a7c8191b9ed26e5aa0f77e9` | 원본을 freeze하지 않고 격리, 무변경 읽기 참조 안정·과거 snapshot 안정. 외부 identity 비보장 | V08–V09 |
| R08 날짜 계산·포맷 | E60 회수 `Sentinel_69783f3c0c5c81919890d2346578a126` → `Sentinel_48724c8802888191bbeb75871975b389` | add 정수 검증·YY 경계·합의된 datetime 포맷을 특정 실행기의 현재 기본값에 숨기지 않음. 전체 codec 일괄 강제 아님 | V10–V12 |
| R09 최초 적용 완료 | E61 회수 `Sentinel_047689a8125c8191a77c7254d5839908`, `Sentinel_7203451c1c408191826041c8ceefcb27` → `Sentinel_22e5a1b086288191b520ad17919120ef` | 앞선 “최초 승인 추가 확인 필요” 상태를 실제 제안/수락 회수로 보완. 점진 표시·최초 실행 가능한 조회의 정리·입력 대기 제외·구조 실패 보존 | N03–N05 |
| R10 선택 차트·fanout 한정 | E62–E66의 회수 제안/수락은 아래 표와 근거 색인. E64 `Sentinel_fdf777a00f3881918a6880bc662ca55f` → `Sentinel_d96923d419488191a201caf2836439d6` | 차트와 fanout의 다섯 근거가 정한 종류·엔진·순서·설정/데이터·결측 경계를 구체화. 여러 명시 Query·배열 inputs는 계속 허용하고 목록 자동 생성만 제외 | Q21, X01–X08 |
| R11 완료한 State 쓰기 비롤백 | E67 `Sentinel_1d8ee534092c8191a60a864d3e57f92c` → `Sentinel_d5bfd5004000819180e71fb007d4ca82` | 외부 효과 비롤백만 읽고 앞서 성공한 State 쓰기를 되돌리는 오구현 방지. 새 원자 변경 묶음과 구별 | A23–A25 |
| R12 정적 화면의 콜백 선택성 | E68 `Sentinel_4e984034c6f88191b7089318740f0b2d` → `Sentinel_c827525e3df08191955e610348f3ac0a` | 정적/인라인 화면에 서비스 조회 콜백을 필수로 만들지 않음. 필요한 실제 연결이 없으면 오류. 옛 SDK 이름을 새 API로 강제하지 않음 | N01–N02 |

| 차트 보충 | 회수 제안 → 사용자 수락 | 유지할 예외 |
|---|---|---|
| E62 종류·엔진 | `Sentinel_995c42cf3cac8191bb1b4b8fac0c642d` → `Sentinel_95373d3a9f3c8191aa6bb37518cbe251` | core 기본 등록·모든 엔진 option 동등 지원·자동 엔진 전환 아님 |
| E63 LineChart 순서 | `Sentinel_c8262d5d8c948191a745eba73fd96a67` → `Sentinel_d1afe429b60081919a56289a90f09c8e` | time/value 축도 최종 순서/중복 보존, 정렬은 명시 상위 변환 |
| E65 series/data | `Sentinel_1df0a3293460819181affeca449bef73` → `Sentinel_df3903971fb481918593964d1e681415` | 안정 데이터 ID의 defaults/overrides, option.series·series.data 금지; 모든 위젯에 동적 series 강제 아님 |
| E66 Y/결측 | `Sentinel_b8250c9e62f08191baf6c124031440d4` → `Sentinel_fe6ef0c3b7b481919e9e5150202f58a0` | number 또는 명시 null, 숫자 문자열·필드 누락 오류, null≠0 |

## 보존·대체·미결을 적용하는 순서

1. 현재 승인 의미와 필요한 예외를 본문에서 읽는다. 짧은 수락은 실제 직전 제안의 범위로 한정한다.
2. 명시적으로 대체된 ref 객체·bare 참조 키·내부 spec·children·필수 GridItem·저장 원본 필수 실행·전용 auth kind를 되살리지 않는다. 반대로 이름/외피 변경만으로 기존 값·조회·URL·차트 의미를 없애지 않는다.
3. 현재 설명으로 닫히지 않은 배치/DTO/SDK는 [O목록](open-contracts.md)으로 연결한다. Query 순환·Action 재귀·Catch/Finally의 지원 범위와 이미 확정된 Component/Derived 순환 거절·기본 실패 중단을 구별한다.
4. 이 표의 “확정”은 구현 완료가 아니다. [인수 백로그](acceptance-matrix.md)와 선택 차트 X항목에 코드·fixture·실행 명령·실제 결과가 연결될 때 구현 검증 상태를 별도로 갱신한다.
