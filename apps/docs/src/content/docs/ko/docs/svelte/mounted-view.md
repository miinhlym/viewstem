---
title: MountedView와 RenderAttachment
description: View 핸들로 렌더링을 기다리고 정의를 적용하거나 연결을 정리합니다.
sidebar:
  order: 2
---

## MountedView

`renderer.mount({ target, source, inputs?, url?, onError? })`는 화면 핸들을 동기 반환합니다. `screen.ready`로 View를 얻습니다. 현재 DOM은 `screen.whenRendered()`, 적용의 Query 보고와 DOM 반영은 `screen.whenSettled(application)`으로 기다립니다. `await screen.unmount()`는 소유 View와 대상을 정리합니다.

## RenderAttachment

`renderer.attach(view, target, options?)`는 View를 빌립니다. `whenRendered()`, `whenSettled(application)`, `detach()`를 제공하며 대상 재사용 전에 `detach()`를 기다립니다. View의 수명은 소유자가 관리합니다.

`view.initial`은 최초 적용이며 `updateDefinition`, `setInputs`, `replace`는 이후 적용 핸들을 반환합니다. `view.whenSettled(application)`은 렌더링을 기다리지 않고 Query 보고를 기다립니다. 두 완료 방식 모두 브라우저 paint를 기다리지 않습니다.
