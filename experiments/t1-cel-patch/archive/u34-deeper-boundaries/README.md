# U34 숫자·timestamp 추가 경계 실패

동시 parsed 평가 수정 후, int 최솟값 나눗셈/부호 반전 overflow·timestamp 범위/밀리초 손실·0099년 시간대 getter 문제 5개를 Node/Chromium에서 재현했다. 157개 검사 중 147개 통과. 수정 전 패치와 결과를 보존한다.
