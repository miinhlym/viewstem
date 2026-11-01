# U34 초기 패치 실험

Node/Chromium 각각 동시 실행한 parsed quantifier의 일부 결과가 undefined인 실패를 보존한다. 원본 8.0.0에서도 같은 동작을 별도로 재현했다. 147개 검사 중 145개 통과했으며 비용/엄격 timestamp 보완의 첫 개발 결과다.
