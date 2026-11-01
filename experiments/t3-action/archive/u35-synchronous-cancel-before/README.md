# U35 동기 취소 뒤 늦은 실패의 수정 전 증거

실행 콜백이 동기적으로 자기 연결을 제거하고 Promise를 반환하면 awaitCurrent가 취소 검사에서 먼저 throw하여 Promise의 늦은 reject가 회수되지 않았다. 기존 15개 통과 뒤 추가 회귀 1개 실패(15/16)를 `result.json` 및 당시 전체 소스 snapshot에 보존한다. native/Query/Variable 세 콜백 경로의 기대값은 CANCELLED와 unhandledRejection 0건이다. 현재 수정은 전달된 Promise에 먼저 실패 회수 경로를 붙이고 동일한 취소/오류 의미를 유지한다.
