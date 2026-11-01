# 날짜 경계 후속 검사 전 T1 보존

기존 T1 원시 결과와 수정 직전 소스·lockfile을 보존한다. 기존 전체 T1 결과에는 sourceSha256이 없었으므로 snapshot-sha256.json은 이번 보존 시점의 해시다. 과거 실행 시점 검증 해시로 소급하지 않는다. 배열 크기 결과의 별도 sourceSha256은 기존 형식을 유지한다. [현재 README](../../README.md)를 따른다.
