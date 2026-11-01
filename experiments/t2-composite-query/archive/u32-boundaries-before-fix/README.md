# U32 복합 Query 경계 수정 전 실패

Node 22/24 각각 65개 중 60개 통과·5개 실패였다. 명시 null을 생략으로 처리하는 3개 위치, escaped 필수 입력 이름, Concat의 많은 배열 전달이 실패했다. snapshot은 각 결과의 sourceSha256과 일치하며 당시 실험 디렉터리 기준으로 해석한다. 현재 결과는 [현재 README](../../README.md)를 따른다.
