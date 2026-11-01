# 비동기 코드 Action 재진입 재현

Node 22/24 각각 23개 중 22개 통과, K05/dynamic-native-reentry-after-await 실패. 3회에서 끝내는 유한 fixture에서 재귀 거절 없이 완료된다. 서로 독립적인 두 호출의 동시 실행은 다른 fixture에서 허용된다. 따라서 owner별 같은 Action 실행 금지로 대체할 수 없다. 현재 public invoke에는 부모 호출을 전달할 계약이 없다. 사용자에게 하위 호출 경계를 설명 중이며 아직 새 API는 승인되거나 구현되지 않았다.
