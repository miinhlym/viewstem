# U30 polling 오류 위치 전달 실패

P27에서 Query의 정제된 오류 location/cause가 polling 완료 훅을 거치며 사라졌다. Node 24.19.0에서 34개 중 33개 통과·P27 실패를 재현했다. 당시 입력 소스와 결과를 snapshot/ 아래에 보존했다. 결과 해시는 snapshot/experiments/t2-query-polling/을 기준으로 해석한다.

이후 완료 훅이 모든 인자를 그대로 전달하도록 수정했고 P27 회귀와 고의 결함 대조군을 추가했다. 현재 결과는 [상위 README](../../README.md)를 따른다.
