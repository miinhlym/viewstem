# U30 개발 중 발견과 수정 전 증거

복합 Query 첫 연결에서 40개 중 30개 통과, 10개 실패를 기록했다. 새 실험의 입력 prototype 차이로 재사용이 무효화되었고, 기존 Query 모형은 source/transform 오류 위치를 제거했다. 재사용 실패가 fresh 갱신 구별 누락도 가렸으므로 이후 이를 함께 회귀 검증한다.

snapshot은 당시 repository-relative 파일 구조를 보존한다. 결과 파일의 sourceSha256 경로는 각 snapshot/experiments/<실험> 기준으로 읽는다. 기존 Query 및 Query–HTTP 결과도 당시 소스와 함께 보존했다. 이 실패는 현재 상태가 아니며 [현재 실험](../../README.md)을 따른다.
