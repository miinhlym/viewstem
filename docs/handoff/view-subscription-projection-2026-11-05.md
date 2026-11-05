# View 구독 재진입 후 투영 불일치 — 2026-11-05

상태: **2026-11-06 제품 수정·회귀 검증·원본 실패 앱의 새 패키지 재검증 완료.** [정확한 원인과 수정 증거](view-subscription-projection-fix-2026-11-06.md)를 따른다. 아래는 소비자 스킬 확장 실험의 `codex-form-refresh-B2-r3`에서 발견한 당시 재현·가설·미해결 범위를 보존한다. 원본 실패를 통과로 덮어쓰지 않는다.

## 관찰과 영향

`View.subscribe` 콜백에서 Query 결과를 읽어 표시용 State에 동기적으로 쓰면, State와 Query snapshot은 정상인데 View 노드의 `inputs.text`와 DOM은 이전 값으로 남는 사례를 확인했다. 실제 폼에서는 저장 버튼만 보이고 요청한 `Loaded: Initial` 표시가 나오지 않았다. 타입·번들 검사와 core의 Query 성공만으로 이 UI 실패를 발견할 수 없었다.

Node `v22.21.1`, `@viewstem/core 0.1.0` 개발 tarball SHA-256 `a84956007a20dec39028ace483a8faa727fc7b0b842095cd97e4a966c057fefb`에서 public core API만으로 재현했다. 브라우저에서는 같은 core와 초기 평가의 Svelte/UI tarball을 사용했다. 버전 문자열만 같은 다른 산출물로 확대하지 않는다.

```json
{
  "calls": ["load"],
  "initialComplete": {"generation": 1, "queryErrors": []},
  "query": {"status": "success", "data": "Initial", "error": null},
  "state": "Loaded: Initial",
  "nodeInput": ""
}
```

최소 재현은 초기 `loadedText: ''` State를 Label의 text에 연결하고, Query 완료를 View 구독에서 받아 `loadedText.write('Loaded: Initial')`를 호출한다. 완료 뒤 State와 `view.getSnapshot().roots[0].inputs.text`를 비교한다. 전체 public API 재현 코드와 결과, 원본 실패 산출물은 [확장 평가 결과](../../skills/tests/extended-results.json)의 `runtimeFinding`과 해당 run에 보존한다. 이 재현의 성공은 **결함 재현**이며 제품 테스트 통과가 아니다.

## 검증된 회피 방법과 계약 경계

진단 복사본에서 Query 데이터를 `/queries/loaded/data`로 Label에 직접 바인딩하고 접두 문구를 별도 Label로 구성하니 초기 표시·저장 후 재조회·실패 후 값 유지·정리까지 전체 form 검사가 통과했다. 구독 안의 쓰기만 microtask로 지연한 대조도 통과했다. 스킬 B3에는 표시 값을 선언적으로 연결하라는 최소 권고를 반영했다.

공개 README와 타입에서 `View.subscribe` 안의 State 쓰기를 금지하는 계약은 찾지 못했다. [StateStore 관찰·반응 계약](../spec/09-preserved-contracts.md)은 재진입 쓰기를 다음 원자 묶음으로 처리하지만 View 구독에 동일 조항이 적용되는지는 명시가 부족하다. 따라서 범용 구독 쓰기 금지 규칙을 새 계약으로 추가하지 않는다.

중첩 투영 계획의 조기 반환과 동기 listener 호출이 관찰과 부합한다는 코드상 가설은 있으나, 원인을 확정한 제품 회귀 테스트나 수정은 없다. 직접 바인딩 회피가 동작한다고 원래 실패를 통과로 바꾸지 않는다.

## 후속 완료 조건

1. public API 재현을 제품 회귀 테스트로 옮기고 View 구독의 재진입 처리 계약과 대조한다.
2. State·노드 투영·renderer DOM이 일치하도록 수정하고, 무한 갱신·일괄 처리·수명 종료에 대한 관련 회귀를 확인한다.
3. 수정한 새 tarball에서 원본 실패 앱을 다시 검사하고 스킬의 개발 빌드 제한 안내를 갱신한다.

이번 작업은 스킬 보완·비교 검증이므로 제품 코드는 변경하지 않았다. 원본 실패, 진단용 회피 구현, 이후 모델이 만든 B3 산출물의 결과를 구별한다.
