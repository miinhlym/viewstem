import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { compile, compileModule } from 'svelte/compiler';

export const svelteConsumerPlugin = {
  name: 'test-svelte-consumer',
  setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const result = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' });
      return { contents: result.js.code, loader: 'js', resolveDir: dirname(path) };
    });
    builder.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => {
      const result = compileModule(await readFile(path, 'utf8'), { filename: path, generate: 'client' });
      return { contents: result.js.code, loader: 'js', resolveDir: dirname(path) };
    });
  },
};
