# Stage 9 — Implementation Readiness

Reviewer `/root/final_stage9_readiness`, actual FINAL_ANSWER received.

COMPLETE — **최소 비교 실험은 착수 가능하지만, 전체 계획을 새 구현자에게 그대로 넘기는 Implementation Readiness 기준은 미통과**입니다. Blocker 0 / Major 2 / Nit 0입니다.

## S9-R01 · Major — 호스트별 설치·발견 계약이 구현 단계로 미뤄져 있음

- 대상: §7 239–241행. 선행 계약 44·46·184·190·202행.
- 두 호스트의 동등한 지원과 위치에 무관한 실행 환경은 확정했지만, 실제 설치·발견·업데이트·되돌리기 경로는 아직 선택되지 않았다. 이는 검증 결과만 나중에 채우는 문제와 다르다.
- Claude 공식 snapshot 159–164, 223–228행은 개인·프로젝트 폴더와 cloud project thread의 발견 경로가 다르다고 명시한다. 현재 계획으로는 로컬 두 호스트만 검사하고 환경 지원을 과대 보고할 수 있다.
- 최소 수정: 두 integration 파일에 지원할 발견 경로별 설치 위치/수단, 호출·상대 참조·도구 실행 확인 방법, 동일 revision 식별 및 교체·복귀 절차를 고정하고 §7 완료 기준과 연결한다. 실제 성공 증거는 구현 이후 확보하면 된다.

## S9-R02 · Major — inspect-ui의 관찰 가능한 출력·경계 동작이 미완결

- 대상: §7 237행. 선행 계약 127·137–143·153–162행.
- 출력 version과 필수 정보는 정했지만 명령별 result 구조, 마지막 페이지와 `offset >= total`의 nextOffset 처리, 16KiB를 전체 직렬화 결과와 선택 스키마 중 어디에 적용하는지는 정하지 않았다.
- 구현자와 테스트 작성자가 서로 다른 pagination 종료나 출력 제한 동작을 정해도 현재 설명을 만족할 수 있다.
- 최소 수정: 네 성공 결과의 JSON 예시 또는 스키마와 빈/마지막/범위 밖 페이지 기대값, UTF-8 한도 계산 대상, 초과 오류의 필수 필드를 고정한다. 이는 2단계 착수 전 보완 사항이며 최소 스킬 실험을 막지는 않는다.

§6.2의 세 과제와 A→B→필요한 C 비교는 초기 실험의 범위로 충분하다. 그 실험에서 근거를 얻어 자료를 보강하고, UI 조회 도구는 211행의 도입 조건을 만족할 때 진행할 수 있다. 공개 릴리스 ref·최종 지원 버전·실행 결과가 아직 없는 점은 자연스러운 배포 완료 조건이므로 발견으로 세지 않았다. 6개 reference 경로도 §2.1에서 구체 목록을 제공하므로 전체 파일 경계가 미정이라고 판단하지 않았다.

## 실제 읽기

- EGM `agents/implementation_readiness.md` 전문, `resources/document_standards/implementation-readiness-standard.md` 전문.
- 대상 1–267행 전체, SHA-256 `93d6a46b61ed990fb2385b3e6565950d90033bdeeb72015406f2f8a1820b6967`.
- 전문: goldfish_context.md, 공식 evaluating snapshot, docs/README.md, package.json.
- 발췌: 명세 410–445행, 결정 D119–121, implementation-start 1–100행, UI test-package.mjs 1–95행, Claude skills 150–250행, OpenAI build-skills 1–105행 및 설치 검색.
- 검색 결과만: core prepare-cel/build/test-package.mjs, Svelte test-package.mjs, UI vendor-source.mjs.

다른 최종 검토 보고서·research_report.md·부모 대화·비공개 기억·context-archive는 읽지 않았다. 파일 변경·빌드·설치·테스트 실행 없음. 경로 반복만 줄여 완료 응답을 보존했다.
