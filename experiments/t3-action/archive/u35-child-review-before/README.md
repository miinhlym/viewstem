# U35 하위 호출 독립 리뷰의 수정 전 증거

최초 하위 호출 12개 검사 통과 뒤, 독립 리뷰에서 중첩 인라인 native 실행과 부모 Query 래퍼의 자식 취소 신호 유실을 재현했다. 추가 회귀 3개가 실패한 `result.json`과 당시 소스를 `snapshot/`에 보존한다. 부모 종료 뒤 자식의 pending/active refresh·retry ticket이 남는 현상을 실제 QueryProbe로 검사했다. 현재 코드의 결과는 이 기록을 덮어쓰지 않는다.

`review-reproducer.mjs`는 리뷰의 원본 보조 재현이며 절대 경로 import를 사용한다. 보관 snapshot 재실행은 sourceSha256의 의존 파일과 고정된 기존 실험 의존성 설치를 같은 상대 구조에 구성해야 한다. 이 폴더는 배포용 실행물이 아니다.
