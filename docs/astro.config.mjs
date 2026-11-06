import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';
import starlightThemeNova from 'starlight-theme-nova';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

const base = '/ddd-cqrs';

// Top bar links, one per main sidebar group, with the label and URL of each language.
const navLink = (path, en, el) => ({
  label: { en, el },
  href: { en: `${base}/${path}/`, el: `${base}/el/${path}/` },
});
const nav = [
  navLink('overview', 'Start', 'Ξεκίνημα'),
  navLink('concepts/wrapping', 'Concepts', 'Έννοιες'),
  navLink('guides/plain-node', 'Guides', 'Οδηγοί'),
  navLink('packages/pipeline', 'Packages', 'Πακέτα'),
  navLink('api', 'API reference', 'Αναφορά API'),
];

export default defineConfig({
  site: 'https://aristoteliss.github.io',
  base,
  integrations: [
    starlight({
      title: 'ddd-cqrs',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        el: { label: 'Ελληνικά', lang: 'el' },
      },
      description:
        'Pipeline behaviors and DDD building blocks for TypeScript, with no framework.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/aristoteliss/ddd-cqrs',
        },
      ],
      components: { Header: './src/components/Header.astro' },
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightThemeNova({ nav }),
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
          translations: { el: 'Ξεκίνημα' },
          items: [
            {
              label: 'Overview',
              translations: { el: 'Επισκόπηση' },
              slug: 'overview',
            },
            {
              label: 'Getting started',
              translations: { el: 'Πρώτα βήματα' },
              slug: 'getting-started',
            },
          ],
        },
        {
          label: 'Concepts',
          translations: { el: 'Έννοιες' },
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        {
          label: 'Guides',
          translations: { el: 'Οδηγοί' },
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Packages',
          translations: { el: 'Πακέτα' },
          items: [{ autogenerate: { directory: 'packages' } }],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
