# UI 동적 값 수정 전 증거

`ui-probe.mjs`는 수정 전 원본 그대로다. `results/node22.json`, `node24.json`, `chromium.json`은 종전 모형 44개/Chromium 52개 결과다. 이는 당시 검사에 없던 결함이 없다는 뜻이 아니다.

`reproduction.mjs`는 원본 소스를 읽고 **의존성 import 주소만** 실행 가능한 절대 경로로 바꿔 메모리에서 실행한다. 원본 파일 bytes는 바꾸지 않는다. 결과에는 보존 소스와 재현 fixture hash를 기록한다.

```sh
/Users/minholim/.nvm/versions/node/v22.21.1/bin/node experiments/t3-ui/archive/u34-dynamic-before/reproduction.mjs
/opt/homebrew/opt/node@24/bin/node experiments/t3-ui/archive/u34-dynamic-before/reproduction.mjs
```

두 명령은 의도대로 **9개 기대값 모두 실패하며 종료 코드 1**이다. 배열 length/비정규 인덱스·Pointer escape, owner 루트, concat, 혼합 연산자, 명시 ports에서 읽는 State.initial, initial 생략과 초기 순환을 재현한다. `node22-reproduction.json`, `node24-reproduction.json`은 현재 수정 결과와 구별한다. 수정 후 대응 검사는 현재 `dynamic-scenarios.mjs`에 있다.
