<script lang="ts">
  import InfoIcon from '@lucide/svelte/icons/info';
  import { Button } from '@/components/ui/button/index.js';
  import { Checkbox } from '@/components/ui/checkbox/index.js';
  import * as Collapsible from '@/components/ui/collapsible/index.js';
  import * as Field from '@/components/ui/field/index.js';
  import { Input } from '@/components/ui/input/index.js';
  import * as NativeSelect from '@/components/ui/native-select/index.js';
  import type { setupComponentDemo } from '../examples/component-demo-client';
  import type { DemoControl } from '../examples/component-demo-controls.mjs';

  type ControlValue = DemoControl['value'];
  let { controls, ko, controller }: {
    controls: DemoControl[];
    ko: boolean;
    controller: ReturnType<typeof setupComponentDemo> | null;
  } = $props();

  // Composition only gates input events, so it does not need to drive rendering.
  const composing = new Set<string>();
  let drafts = $state<Record<string, ControlValue | undefined>>({});
  let errors = $state<Record<string, string>>({});

  function change(control: DemoControl, value: ControlValue) {
    drafts[control.id] = value;
    delete errors[control.id];
    controller?.apply(control, value);
  }

  function input(control: DemoControl, element: HTMLInputElement) {
    if (composing.has(control.id)) {
      drafts[control.id] = element.value;
      return;
    }
    if (control.kind !== 'number') {
      change(control, element.value);
      return;
    }
    const value = element.valueAsNumber;
    if (Number.isFinite(value) && element.validity.valid) {
      change(control, value);
      return;
    }
    // Match Svelte's numeric binding, including an empty or incomplete draft.
    drafts[control.id] = Number.isFinite(value) ? value : undefined;
    errors[control.id] = ko
      ? `${control.min}–${control.max} 범위에서 ${control.step} 단위로 입력하세요. JSON은 마지막 유효한 설정을 유지합니다.`
      : `Enter ${control.min}–${control.max} in steps of ${control.step}. JSON keeps the last valid setting.`;
  }

  function restore() {
    drafts = {};
    errors = {};
    composing.clear();
    controller?.restore();
  }
</script>

<Field.Set data-demo-options disabled={!controller} aria-describedby="options-help">
  <Field.Legend>{ko ? '주요 옵션' : 'Key options'}</Field.Legend>
  <Field.Description id="options-help">
    {ko ? '변경하면 JSON과 미리보기를 갱신하고 실행 상태를 초기화합니다.' : 'Changes update JSON and restart the preview.'}
  </Field.Description>
  <Field.Group class="options-grid">
    {#each controls as control (control.id)}
      {@const inputId = 'demo-control-' + control.id}
      {@const helpId = 'demo-help-' + control.id}
      {@const errorId = 'demo-error-' + control.id}
      {@const value = control.id in drafts ? drafts[control.id] : control.value}
      {@const error = errors[control.id]}

      <Collapsible.Root class="option-field" id={'demo-option-' + control.id}>
        <Field.Field data-invalid={error ? true : undefined}>
          <div class="option-heading">
            {#if control.kind === 'boolean'}
              <Checkbox
                id={inputId}
                data-control={control.id}
                checked={Boolean(value)}
                onCheckedChange={checked => change(control, checked)}
                aria-describedby={helpId}
              />
            {/if}
            <Field.Label for={inputId}>{control.label}</Field.Label>
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-xs"
                  data-option-details={control.id}
                  aria-label={(ko ? '옵션 설명: ' : 'Option details: ') + control.label}
                >
                  <InfoIcon aria-hidden="true" />
                </Button>
              {/snippet}
            </Collapsible.Trigger>
          </div>
          {#if control.kind === 'select'}
            <NativeSelect.Root
              id={inputId}
              data-control={control.id}
              value={String(value)}
              onchange={event => change(control, event.currentTarget.value)}
              aria-describedby={helpId}
            >
              {#each control.options ?? [] as option (option.value)}
                <NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
              {/each}
            </NativeSelect.Root>
          {:else if control.kind !== 'boolean'}
            <Input
              id={inputId}
              data-control={control.id}
              type={control.kind}
              value={typeof value === 'boolean' ? undefined : value}
              min={control.min}
              max={control.max}
              step={control.step}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${helpId} ${errorId}`}
              oninput={event => input(control, event.currentTarget)}
              oncompositionstart={() => composing.add(control.id)}
              oncompositionend={event => {
                if (composing.delete(control.id)) input(control, event.currentTarget);
              }}
            />
          {/if}
          <div id={errorId} data-control-error={control.id} role="status">
            {#if error}<Field.Error>{error}</Field.Error>{/if}
          </div>
          <Collapsible.Content class="option-details" forceMount>
            <Field.Description id={helpId}>{control.description}</Field.Description>
            <code class="option-path">{control.path.join('.')}</code>
            <Field.Description class="option-actions">
              <a href={control.reference}>{ko ? '상세 설명' : 'Reference'}</a>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-show-json={control.id}
                aria-label={(ko ? 'JSON에서 보기: ' : 'Show in JSON: ') + control.label}
                onclick={() => controller?.showJson(control)}
              >
                {ko ? 'JSON에서 보기' : 'Show in JSON'}
              </Button>
            </Field.Description>
          </Collapsible.Content>
        </Field.Field>
      </Collapsible.Root>
    {/each}
  </Field.Group>
  <div>
    <Button type="button" variant="outline" size="sm" data-demo-restore onclick={restore}>
      {ko ? '기본 예제로 되돌리기' : 'Restore default example'}
    </Button>
  </div>
</Field.Set>
