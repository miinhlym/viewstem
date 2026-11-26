import type { GetStaticPaths, InferGetStaticPropsType } from 'astro';
import { resourceKinds, resourceSchemaJson } from '../../../lib/resource-schemas.mjs';

export const getStaticPaths = (() => resourceKinds.map(kind => ({
  params: { kind: kind.toLowerCase() }, props: { kind },
}))) satisfies GetStaticPaths;

export function GET({ props }: { props: InferGetStaticPropsType<typeof getStaticPaths> }) {
  return new Response(resourceSchemaJson(props.kind), {
    headers: { 'content-type': 'application/schema+json; charset=utf-8' },
  });
}
