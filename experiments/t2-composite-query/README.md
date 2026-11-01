# T2 복합 Query와 polling 연결 실험

명시적인 하위 Query inputs, 형제 sources, Concat/Join, 입력별 결과 재사용을 기존 Query 스케줄러와 [완료 기준 polling](../t2-query-polling/README.md)에 연결하는 독립 실험이다. 일반 core·SDK·전체 Query 등록/스키마 엔진은 아니다.

## 실행

Node 22 이상, 추가 의존성 설치 없이 실행한다.

```sh
cd experiments/t2-composite-query
node run.mjs node24.json
```

Node 22 바이너리로 같은 명령을 실행하고 결과 이름을 `node22.json`으로 바꾼다. 기본 `npm test`는 node24.json에 쓰며 실제 Node 버전은 파일 내부에 기록한다.

macOS arm64의 Node 22.21.1·24.19.0에서 각각 **65/65 통과, 고의 결함 5/5 탐지**했다. [Node 22 결과](results/node22.json)·[Node 24 결과](results/node24.json)에 환경·소스 SHA-256·요청/캐시/snapshot 기록이 있다. 64건은 제어 전송 또는 순수 함수/정의 검사이고, H01은 실제 HTTP 요청 11건을 포함한 결합 시나리오다. 전체 65건이 실제 네트워크 검사는 아니다.

## 코드와 범위

| 파일 | 책임 |
|---|---|
| [composite-probe.mjs](composite-probe.mjs) | 참조/인라인 Query 그래프, 필수 하위 입력 바인딩·순환 검사, 형제 병렬 실행, Concat/Join, owner별 결과 재사용과 전체 성공 후 cache commit |
| [harness.mjs](harness.mjs) | 기존 Query 스케줄러 연결, 지연 응답·취소를 무시한 완료, 수명/타이머/대기자/cache 정리 |
| [scenarios.mjs](scenarios.mjs) | 입력 변화·fresh·오류 위치·owner 교체·polling·변환/그래프 사례 |
| [boundaries.mjs](boundaries.mjs) | U32의 명시 null·escape·많은 배열 Concat, 중첩 재사용·취소·원본 격리 |
| [http-check.mjs](http-check.mjs) | 실제 HTTP 실행기와 복합 Query/polling의 결합. 부분 응답 대기→입력별 재사용→주기 실패→회복→즉시 재개·다음 주기 |
| [run.mjs](run.mjs) | 전체 실행·고의 결함·결과/해시 기록 |

재사용 단위는 명시적인 inputs를 가진 **하위 Query 사용 경로**다. 같은 definition을 참조해도 다른 owner 또는 다른 source 경로이면 별도 캐시다. 직접 HTTP 형제 source 각각의 필드 의존성을 분석하는 최적화는 구현하지 않았다. 입력 변경용 자동 실행은 유효한 하위 결과를 재사용하고, 수동 refresh/retry/periodic은 fresh 표시를 전달해 다시 실행한다. 이 fresh 필드는 두 실험 사이의 private metadata이며 공개 SDK 추가가 아니다.

이 실험은 root 전체가 성공한 경우만 staged cache를 반영하는 보수적 방식을 사용한다. 실패한 실행의 부분 source를 내부 캐시로 재사용할 수 있는 모든 구현 전략을 금지하는 새 공개 계약은 아니다. **부분 결과를 전체 성공으로 게시하지 않는 것**이 확정 계약이다. 입력/owner가 바뀐 실행은 캐시를 commit하지 않으며 owner 폐기 시 캐시를 제거한다.

Concat은 순서·중복·이질 데이터를 보존하고, Join은 strict 복합키·null 비매칭·left/right/inner 순서·다중 매칭·오른쪽 충돌 우선·미매칭 원본을 검사한다. source/transform 실패는 위치와 정제된 cause를 보존하고 raw 예외 문자열을 공개하지 않는다. 정의의 직접/간접/인라인 순환·미등록 ref·ref/inline 혼합·정적인 필수 하위 바인딩 누락은 요청 없이 거절한다.

고의 결함은 입력 비교 생략, 실패 전 부분 캐시 commit, obsolete 실행 commit, fresh 무시, owner cache 정리 누락이다. 각 지정 사례에서 assertion 실패를 확인한다. 정상 사례 뒤 timer·대기자·owner cache가 남지 않는다. 실제 HTTP는 임시 127.0.0.1 서버만 사용하며 실패/성공 순서는 응답 gate로 제어한다. timeout watchdog은 계약 결과로 세지 않는다.

## 발견과 수정

- 일반 객체와 null-prototype 객체의 prototype 차이 때문에 같은 입력도 재사용하지 못했다. 값 입력을 복사한 공통 표현으로 비교해 수정했다.
- 기존 Query 스케줄러가 오류 코드만 남겨 source/transform location·cause를 잃었다. 안전한 public 오류 필드를 보존하고 raw message/getter를 사용하지 않도록 보완했다.
- 입력 변경용 재사용과 fresh 갱신을 구별할 metadata를 연결했다. 재사용 버그를 고친 뒤에도 수동/주기 갱신이 실제 요청을 건너뛰지 않는지 검사했다.
- owner 교체 후 이전 cache가 남았다. private disposeOwner 연결로 정리했다.
- 참조된 하위 Query 오류는 그 Query의 resource ID와 `/spec/...` 위치를, 인라인 오류는 포함 문서의 `/spec/sources/별칭/query/...` 위치를 사용하도록 고쳤다. 실행 경로와 선언 문서 경로를 혼동하던 기대값도 바로잡았다.
- polling 완료 hook이 새 오류 인자를 누락하는 문제는 [polling 실험](../t2-query-polling/README.md)에서 수정·회귀 검증했다.

[첫 연결 실패와 당시 Query/HTTP 결과](archive/u30-development/README.md), [owner cache 정리 전 실패](archive/u30-cache-lifetime/README.md), [오류 위치 기대값 보완 전 결과](archive/u30-location-before-resource/README.md)를 당시 소스와 함께 보존한다. archive/snapshot은 repository-relative 구조이며 결과의 sourceSha256은 해당 snapshot의 실험 디렉터리 기준이다. results의 development-*는 당시 출력으로 현재 소스와의 비교에는 archive snapshot을 사용한다.

## U31 재개 결합 후속

C28–C30에서 재개와 입력 변경의 동시 반영이 자식 모두를 fresh로 한 번 실행하는지, 진행 중 수동/입력/재개가 한 건으로 합쳐지는지, 재중단 후 입력 변경용 재사용이 유지되는지 확인했다. H01은 실제 HTTP로 idle 재개와 완료 후 다음 주기를 추가 검증한다. [U30 최종 소스·결과](../t2-query-polling/archive/u30-before-resume/README.md)는 보존하며 U31 결과는 [후속 검사 전 snapshot](archive/u31-before-boundaries/README.md)에 보존한다. 현재 결과는 아래 U32 소스 해시를 담는다.

## U32 후속 경계

[후속 검증 기록](../../docs/handoff/boundary-followup-2026-10-30.md)에 따라 C31–C36/S12–S17을 추가했다. 명시 null을 생략으로 처리하던 3개 위치, escaped 필수 입력 이름, 많은 배열의 Concat을 수정했다. [수정 전 60/65 결과·소스](archive/u32-boundaries-before-fix/README.md)를 보존하며 현재 Node 22/24 결과는 65/65다. 150,000개 배열 사례는 JS 함수 인자 개수에 의존하지 않는지 확인하는 기능 검사이고 운영 예산·성능 보장이 아니다.

## 한계

JSON 형태 fixture 중심이며 전체 JSON Schema·포트 기본값/타입 검증·native 값/Dart·등록/교체 원자성·예산 제한·CEL·StateStore·Action·renderer는 범위 밖이다. 추가 변환 종류나 선택 항목별 자동 Query fanout은 만들지 않았다. 기존 Query 모형의 안전용 timeout을 전체 복합 Query의 새 공개 deadline으로 해석하지 않는다. HTTP 계획의 deadline은 기존 HTTP 실행기 계약을 따른다.

재사용에 대한 구조/입력 정의는 실험 시작 시 복사하며 동적 definition 편집 API는 제공하지 않는다. 실제 브라우저와 다른 언어에서 이 결합을 실행하지 않았다. 모든 가능한 그래프·실행 순서·운영 부하를 검증했다는 뜻이 아니다. [전체 판단과 문서 대응](../../docs/handoff/t2-composite-polling-2026-10-30.md)을 따른다.
