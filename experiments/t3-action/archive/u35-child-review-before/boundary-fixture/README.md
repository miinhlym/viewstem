기존 private helper가 native를 인라인으로 연결하던 두 fixture의 실패다. 런타임에서 인라인 미등록 코드를 막은 뒤 드러났으며, native는 등록 후 참조하도록 fixture를 고쳤다. 취소/owner 관찰 기대값은 유지한다.
