import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: { plugins: [tailwindcss()] },
  redirects: {
    '/docs/concepts/state-and-actions/': '/docs/concepts/state/',
    '/ko/docs/concepts/state-and-actions/': '/ko/docs/concepts/state/',
    '/docs/concepts/resources-and-ports/': '/docs/concepts/resources-and-types/',
    '/ko/docs/concepts/resources-and-ports/': '/ko/docs/concepts/resources-and-types/',
  },
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'Viewstem',
      expressiveCode: {
        styleOverrides: {
          codeFontFamily: 'var(--site-mono)',
          uiFontFamily: 'var(--site-font)',
          codeFontSize: 'var(--site-text-code)',
          codeLineHeight: 'var(--site-leading-code)',
        },
      },
      favicon: '/brand/viewstem-mark.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/miinhlym/viewstem' }],
      customCss: ['./src/styles/layer-order.css', './src/styles/site.css', './src/styles/docs.css'],
      components: {
        Head: './src/components/docs/Head.astro',
        MarkdownContent: './src/components/docs/MarkdownContent.astro',
        Header: './src/components/docs/Header.astro',
        Sidebar: './src/components/docs/Sidebar.astro',
        TableOfContents: './src/components/docs/TableOfContents.astro',
        MobileTableOfContents: './src/components/docs/MobileTableOfContents.astro',
        PageTitle: './src/components/docs/PageTitle.astro',
        ThemeProvider: './src/components/ThemeInit.astro',
        MobileMenuToggle: './src/components/docs/Empty.astro',
        MobileMenuFooter: './src/components/docs/Empty.astro',
        Pagination: './src/components/docs/Pagination.astro',
      },
      routeMiddleware: './src/lib/docs-route.ts',
      defaultLocale: 'root',
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      locales: {
        root: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
      },
      sidebar: [
        {
          label: 'Getting started',
          collapsed: true,
          translations: { ko: '시작하기' },
          items: ['docs', 'docs/installation', 'docs/quickstart'],
        },
        {
          label: 'Core concepts',
          collapsed: true,
          translations: { ko: '핵심 개념' },
          items: [
            'docs/concepts/view-and-component',
            'docs/concepts/values-and-inputs',
            'docs/concepts/state',
            'docs/concepts/derived-values',
            'docs/concepts/events-and-actions',
            'docs/concepts/queries-and-data',
            'docs/concepts/conditions-and-lists',
            'docs/concepts/component-composition',
            'docs/concepts/resources-and-types',
          ],
        },
        {
          label: 'Guides',
          collapsed: true,
          translations: { ko: '가이드' },
          items: [{ autogenerate: { directory: 'docs/guides' } }],
        },
        'docs/reference',
        {
          label: 'DSL reference',
          translations: { ko: 'DSL 레퍼런스' },
          collapsed: true,
          items: ['docs/dsl', 'docs/dsl/resources', 'docs/dsl/values', 'docs/dsl/view-and-component', 'docs/dsl/state-and-ports', 'docs/dsl/queries', 'docs/dsl/datasources', 'docs/dsl/actions', 'docs/dsl/types'],
        },
        {
          label: '@viewstem/core',
          collapsed: true,
          items: [
            'docs/core',
            { label: 'Usage guides', translations: { ko: '사용 가이드' }, items: ['docs/core/guides/runtime', 'docs/core/guides/state-and-url', 'docs/core/guides/http-and-actions'] },
            { label: 'API reference', translations: { ko: 'API 레퍼런스' }, items: ['docs/core/registry', 'docs/core/runtime', 'docs/core/view', 'docs/core/state-store', 'docs/core/url', 'docs/core/http', 'docs/core/cel', 'docs/core/utilities', 'docs/core/types'] },
          ],
        },
        {
          label: '@viewstem/ui',
          collapsed: true,
          items: [
            'docs/ui', 'docs/ui/guides/mount-in-browser', 'docs/ui/api', 'docs/ui/components',
            { label: 'Components', translations: { ko: '컴포넌트' }, collapsed: false, items: [{ autogenerate: { directory: 'docs/ui/components' } }] },
          ],
        },
        {
          label: '@viewstem/svelte',
          collapsed: true,
          items: [
            'docs/svelte',
            { label: 'Usage guides', translations: { ko: '사용 가이드' }, items: ['docs/svelte/guides/mount-in-svelte', 'docs/svelte/guides/write-an-adapter', 'docs/svelte/guides/manage-view-lifecycle'] },
            { label: 'API reference', translations: { ko: 'API 레퍼런스' }, items: ['docs/svelte/renderer', 'docs/svelte/mounted-view', 'docs/svelte/adapters', 'docs/svelte/viewstem-view', 'docs/svelte/errors', 'docs/svelte/types'] },
          ],
        },
        {
          label: '@viewstem/svelte-ui',
          collapsed: false,
          items: [
            'docs/svelte-ui',
            { label: 'Usage guides', translations: { ko: '사용 가이드' }, collapsed: true, items: ['docs/svelte-ui/guides/register-families', 'docs/svelte-ui/guides/compose-json', 'docs/svelte-ui/guides/style-and-native'] },
            { label: 'API reference', translations: { ko: 'API 레퍼런스' }, collapsed: true, items: ['docs/svelte-ui/registration', 'docs/svelte-ui/component-sets', 'docs/svelte-ui/support', 'docs/svelte-ui/attributes'] },
            { label: 'Components', translations: { ko: '컴포넌트' }, collapsed: false, items: [{ autogenerate: { directory: 'docs/svelte-ui/components' } }] },
          ],
        },
      ],
    }),
    svelte(),
  ],
});
