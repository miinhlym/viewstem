<script lang="ts">
  import { Button, type ButtonProps } from '../ui/button/index.js';
  let { href, ...props }: Omit<ButtonProps, 'href'> & { href?: string | false } = $props();
</script>
<Button {...props} href={href || undefined} />
