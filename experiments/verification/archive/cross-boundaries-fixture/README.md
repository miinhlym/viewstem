# 개발 중 fixture 수정

초기 Node 실행은 6개 중 5개 통과했다. V18의 최종 assertion이 값 계약과 무관한 Object prototype 일치까지 요구해 실패했다. 저장값은 보호된 null-prototype 객체이며 키·값은 기대대로였다. 이후 `Object.entries`로 원본 변경 격리를 확인하도록 fixture만 수정했다. 제품 계약 위반이나 런타임 수정이 아니다. 이 소스·결과는 당시 기록이며 현재 통과 증거는 상위 `results/`를 따른다.
