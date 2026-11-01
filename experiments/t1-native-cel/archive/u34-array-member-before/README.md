# 저장된 array Set 원소 연결 누락 수정 전

독립 리뷰에서 Set<array<integer>>의 저장된 원소를 별도 typed CEL list 입력으로 전달하면 rawMember가 UNSUPPORTED_VALUE로 거절하는 것을 재현했다. 수정 전 자체 소스와 당시 23개 Node/Chromium 시나리오의 각47/47 결과를 보존한다. 이 결과에는 array 원소 membership 반례가 없으므로 현재 적합성 완료 근거로 재사용하지 않는다. 외부 의존성은 결과의 hash/lockfile을 따른다.
