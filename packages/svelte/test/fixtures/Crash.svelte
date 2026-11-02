<script>
  let { inputs, node } = $props();
  function renderValue(value) {
    if (value === 'proxy') throw new Proxy({}, { get() { throw new Error('private proxy getter'); }, getOwnPropertyDescriptor() { throw new Error('private proxy descriptor'); } });
    if (value === 'crash') throw new Error('private adapter details');
    return String(value);
  }
</script>

<output data-crash={node.id}>{renderValue(inputs.value)}</output>
