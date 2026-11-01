# U34 기본 노출 확장 수정 전 증거

기존 patch SHA-256 `7b2e5605b35a1dc6d32d0cc399fe87cb397454626c538a11248121cb4988c978`와 267/267 결과·소스·hash를 snapshot에 보존한다. upstream은 설치 원본, patched-before는 변경 전 검증된 25개 파일 패치 산출물이다. 기존 `.work/build-*`는 수정하지 않는다. 새 독립 확장 회귀의 수정 전 결과도 이 폴더에 보존한다.

수정 전 Node 22/24와 실제 Chromium 각각 353/433, 실패 80개를 재현했다. baseline의 malformed JSON 회귀는 예외 발생까지만 검사했으며 최종 회귀에서는 SyntaxError까지 강화했다. browser 정상 JSON 실패 2개가 TextEncoder.decode 오타를 직접 노출한다. 원본 23개 파일과 수정 전 25개 파일을 각각 보관 manifest와 다시 대조했다. 최종 patch는 `62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63`이다.
