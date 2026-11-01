# U34 duration·명시 int 변환 실패

227개 중 211개 통과. 초과 범위 double→int, 빈 문자열→int, duration milliseconds 부분값, 음수 덧셈/뺄셈, zero duration, 큰 날짜 차이 정밀도 문제를 Node/Chromium에서 재현했다. node_modules/re2js 소스 증거는 해당 고정 의존성·LICENSE이며 lockfile로도 복원 가능하다.
