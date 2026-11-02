<script>
  let { node, renderSlot } = $props();
</script>

<section data-layout={node.id}>
  <header data-slot="header">{@render renderSlot('header')}</header>
  <main data-slot="body">{@render renderSlot('body')}</main>
  <footer data-slot="footer">{@render renderSlot('footer')}</footer>
  <div data-slot="default">{@render renderSlot('default')}</div>
</section>
