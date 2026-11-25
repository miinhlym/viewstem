# Viewstem 소비자용 스킬

외부 앱에서 Viewstem을 설치하고 View, 데이터 흐름, 컴포넌트를 연결하는 작업에 [`viewstem` 스킬](viewstem/SKILL.md)을 사용한다. 패키지와 스킬을 각각 설치한다. 설치 단위는 하나의 리비전으로 고정한 `skills/viewstem/` 폴더 전체다.

## 지원 및 설치

현재 검증 대상은 프로젝트 파일을 읽고 Node.js를 실행할 수 있는 Codex 환경이다. 설치 위치, 발견 확인, 업데이트와 복구 절차는 [Codex 안내](viewstem/integrations/codex.md)가 소유한다. 검증한 CLI 환경의 결과를 다른 Codex 실행 환경에 자동 적용하지 않는다. Claude Code 안내는 [미검증 참고 자료](viewstem/integrations/claude-code.md)다.

## 설계 원칙

- 사용자가 요청한 Viewstem 작업에 필요한 리소스와 호스트 계약만 찾는다. 독립적인 Svelte 작업은 스킬을 활성화하는 근거가 되지 않는다.
- 앱에 설치된 패키지의 export, 타입 및 지원 데이터를 우선한다. 예제·문서와 버전이 다르면 설치된 계약을 확인한다.
- 공통 작업 절차는 한 스킬에 둔다. 호스트별 안내는 설치·발견·실행 차이를 설명한다.
- 현재 배포 후보는 공통 본문, Codex 표시 정보, 두 호스트 안내로 구성한다. 참조와 UI 조회 도구는 기존 자료로 해결되지 않는 반복 오류나 탐색 비용이 관찰될 때 추가한다. 조회 도구의 후보 계약은 [당시 설계의 UI 조회 절](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/design_draft.md#4-ui-계약-조회-도구)에 있다.

## 검증 및 공개

검사는 저장소 밖의 소비 앱과 버전이 확인된 패키지 tarball로 수행한다. 과제마다 새 앱을 준비하고 해당 과제를 구현한 뒤 검사한다. 아래는 첫 View를 검사하는 명령이다. 다른 과제에는 각각 `--scenario form`과 `--scenario native`를 사용한다.

```sh
node skills/tests/consumer.mjs prepare --project /absolute/empty-project --tarballs /absolute/tarballs
node skills/tests/consumer.mjs check --project /absolute/empty-project --scenario first-view
```

비교 실행은 외부 앱, 패키지 버전, 과제와 모델 설정을 고정한다. 기준선에서는 Viewstem 스킬이 로드되지 않았는지, 후보에서는 사용한 스킬 경로와 리비전이 맞는지 확인한다. 첫 View, 폼 입력과 실행 결과, 기본 UI 사용 여부를 실제 산출물과 검사 결과로 판정한다. 스킬 이름을 언급하지 않은 Viewstem 작업과 무관한 작업을 구분해 발견 범위도 확인한다.

공개 안내에는 실제 검증한 호스트, 정확한 패키지 조합, 변경 불가능한 스킬 리비전 및 파일 구성을 기록한다. 검증 가능한 공개 설치 리비전이 정해지기 전에는 현재 후보를 검토한 리비전에서 설치한다.

[당시 상세 설계](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/design_draft.md) · [실험 실행 계약](https://github.com/miinhlym/viewstem/blob/4cc2d048d9c1c6237e62add7057cb595116dc607/docs/designs/viewstem-skills-implementation-2026-11-05.md) · [초기 및 확장 비교 결과](tests/extended-results.json)
