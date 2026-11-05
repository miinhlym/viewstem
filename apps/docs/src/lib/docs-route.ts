import { getCollection } from 'astro:content';
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';

type Entry = StarlightRouteData['sidebar'][number];
type Link = Extract<Entry, { type: 'link' }>;
const link = (label: string, href: string, isCurrent = false): Link => ({ type: 'link', label, href, isCurrent, badge: undefined, attrs: {} });

export const onRequest = defineRouteMiddleware(async (context, next) => {
  await next();
  const route = context.locals.starlightRoute;
  const base = route.lang === 'ko' ? '/ko/docs/svelte-ui/' : '/docs/svelte-ui/';
  const pathname = context.url.pathname;
  if (!pathname.startsWith(`${base}components/`) && pathname !== `${base}attributes/`) return;
  const catalog = `${base}component-sets/`;
  const back = link(route.lang === 'ko' ? '컴포넌트 세트' : 'Component sets', catalog);
  if (pathname === `${base}attributes/`) {
    route.pagination = { prev: back, next: undefined };
    return;
  }
  if (route.toc) route.toc.items.splice(1, 0,
    { depth: 2, slug: 'component-preview', text: route.lang === 'ko' ? '직접 사용해 보기' : 'Try it', children: [] },
  );
  const prefix = `${base.slice(1)}components/`;
  const entries = (await getCollection('docs', entry => entry.id.startsWith(prefix)))
    .sort((a, b) => (a.data.sidebar?.order ?? Infinity) - (b.data.sidebar?.order ?? Infinity) || a.id.localeCompare(b.id));
  const pages = entries.map(entry => link(entry.data.title, `/${entry.id.replace(/\/index$/, '').replace(/\.mdx?$/, '')}/`));
  const index = pages.findIndex(page => page.href === pathname);
  route.pagination = { prev: pages[index - 1] ?? back, next: pages[index + 1] ?? back };
});
