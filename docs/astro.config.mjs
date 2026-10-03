import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

export default defineConfig({
  site: 'https://aristoteliss.github.io',
  base: '/ddd-cqrs',
  integrations: [
    starlight({
      title: 'ddd-cqrs',
      description:
        'Pipeline behaviors and DDD building blocks for TypeScript, with no framework.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/aristoteliss/ddd-cqrs',
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../packages/*'],
          tsconfig: '../tsconfig.base.json',
          output: 'api',
          sidebar: { label: 'API reference', collapsed: true },
          typeDoc: {
            entryPointStrategy: 'packages',
            entryFileName: 'index.md',
            packageOptions: {
              tsconfig: 'tsconfig.build.json',
              readme: 'none',
            },
            plugin: ['typedoc-plugin-mdn-links'],
            externalSymbolLinkMappings: {
              '@openfeature/server-sdk': {
                Client:
                  'https://openfeature.dev/docs/reference/concepts/evaluation-api',
                Provider:
                  'https://openfeature.dev/docs/reference/concepts/provider',
              },
              '@openfeature/core': {
                EvaluationContext:
                  'https://openfeature.dev/docs/reference/concepts/evaluation-context',
              },
              '@mikro-orm/core': {
                EntityManager: 'https://mikro-orm.io/docs/entity-manager',
              },
              'cache-manager': {
                Cache:
                  'https://github.com/jaredwray/cacheable/tree/main/packages/cache-manager#readme',
              },
              cockatiel: {
                IPolicy: 'https://github.com/connor4312/cockatiel#readme',
              },
              zod: { 'ZodError.flatten': 'https://zod.dev/error-formatting' },
            },
          },
        }),
        starlightLinksValidator(),
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Overview', slug: 'overview' },
            { label: 'Getting started', slug: 'getting-started' },
          ],
        },
        {
          label: 'Concepts',
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Packages',
          items: [{ autogenerate: { directory: 'packages' } }],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
