import { getCollection } from 'astro:content';
import { componentSections } from '../examples/component-reference-copy.mjs';
import { getComponentReferenceVariants } from '../examples/component-reference-demos.mjs';
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';

type Entry = StarlightRouteData['sidebar'][number];
type Link = Extract<Entry, { type: 'link' }>;
const link = (label: string, href: string, isCurrent = false): Link => ({ type: 'link', label, href, isCurrent, badge: undefined, attrs: {} });

export const onRequest = defineRouteMiddleware(async (context, next) => {
  await next();
  const route = context.locals.starlightRoute;
  const pathname = context.url.pathname;
  const base = `${route.lang === 'ko' ? '/ko' : ''}/docs/ui/`;
  if (!/\/docs\/ui\/components\/[^/]+\/$/.test(pathname)) return;
  const back = link(route.lang === 'ko' ? '컴포넌트' : 'Components', `${base}components/`);
  if (route.toc) {
    const locale = route.lang === 'ko' ? 'ko' : 'en';
    const variants = getComponentReferenceVariants(pathname.slice(base.length + 'components/'.length, -1), locale);
    const { preview, usage, examples } = componentSections[locale];
    route.toc.items.splice(1, 0, ...[preview, usage].map(({ id, title }) => ({ depth: 2, slug: id, text: title, children: [] })));
    if (variants.length) route.toc.items.splice(3, 0, {
      depth: 2,
      slug: examples.id,
      text: examples.title,
      children: variants.map(({ anchor, title }) => ({ depth: 3, slug: anchor, text: title, children: [] })),
    });
  }
  const prefix = `${base.slice(1)}components/`;
  const entries = (await getCollection('docs', entry => entry.id.startsWith(prefix)))
    .sort((a, b) => (a.data.sidebar?.order ?? Infinity) - (b.data.sidebar?.order ?? Infinity) || a.id.localeCompare(b.id));
  const pages = entries.map(entry => link(entry.data.title, `/${entry.id.replace(/\/index$/, '').replace(/\.mdx?$/, '')}/`));
  const index = pages.findIndex(page => page.href === pathname);
  route.pagination = { prev: pages[index - 1] ?? back, next: pages[index + 1] ?? back };
});
