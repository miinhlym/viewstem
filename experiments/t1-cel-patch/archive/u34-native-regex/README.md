# U34 native RegExp 비용 한계 재현

원본과 첫 비용 패치 모두 s.matches(p)의 중첩 반복 정규식에서 300ms Worker 제한까지 완료되지 않았다. AST 예산이 남아 있어도 네이티브 RegExp 한 번이 오래 실행될 수 있음을 확인한 실패 증거다. Worker 강제 종료를 정규식 적합성 통과로 표시하지 않는다.
