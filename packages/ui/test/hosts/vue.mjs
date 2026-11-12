import { createApp, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { start } from './shared.mjs';

const app = createApp({
  setup() {
    const target = ref(null);
    let stop;
    onMounted(() => { stop = start(target.value); });
    onBeforeUnmount(() => stop?.());
    return () => h('div', { ref: target });
  },
});
app.mount('#host');
window.fixture.unmount = () => app.unmount();
