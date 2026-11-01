# U30 오류 위치 해석 보완 전

당시 46/46 결과는 하위 참조 Query의 실행 경로를 location으로 기대해 실제 선언 문서의 JSON Pointer 계약과 달랐다. 현재는 참조된 Query의 resource와 그 spec 내부 경로를 cause에 보존한다. 당시 통과가 이 누락을 검증한 증거가 아니므로 소스·기대값을 함께 보존한다. snapshot은 repository-relative 구조다.
