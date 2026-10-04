import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const template = resolve(import.meta.dirname, 'consumer');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const nodeEngine = readJson(resolve(root, 'package.json')).engines.node;
// A package whose required peer needs a newer Node declares that peer's range.
const peerNodeEngines = new Map([
  [
    '@cqrs-ddd/mikro-orm',
    readJson(
      resolve(
        root,
        'packages/mikro-orm/node_modules/@mikro-orm/core/package.json',
      ),
    ).engines.node.replace(/\s+/g, ''),
  ],
]);
const isPipeline = (name) => /^@cqrs-ddd\/(?:pipeline(?:-|$)|cqrs$)/.test(name);
const isDdd = (name) =>
  name === '@cqrs-ddd/core' || name === '@cqrs-ddd/mikro-orm';
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });
const tar = (args) => execFileSync('tar', args, { encoding: 'utf8' });
try {
  execFileSync('bun', ['--version'], { stdio: 'ignore' });
} catch (error) {
  throw new Error(
    'The release check loads every package in Bun: install Bun (https://bun.sh) and put it on PATH.',
    { cause: error },
  );
}
const packages = readdirSync(resolve(root, 'packages'))
  .sort()
  .flatMap((name) => {
    const dir = resolve(root, 'packages', name);
    const path = resolve(dir, 'package.json');
    if (!existsSync(path)) return [];
    const manifest = readJson(path);
    return manifest.private === true ? [] : [{ dir, manifest }];
  });
const expected = new Map(
  packages.map(({ manifest }) => [manifest.name, manifest]),
);
if (!packages.length || expected.size !== packages.length) {
  throw new Error('Expected nonempty, unique publishable package names');
}

// Outside the checkout: ancestor node_modules must not satisfy undeclared dependencies.
const temporary = mkdtempSync(resolve(tmpdir(), 'cqrs-ddd-release-'));
try {
  const packed = resolve(temporary, 'packed');
  const consumer = resolve(temporary, 'consumer');
  mkdirSync(packed);
  mkdirSync(resolve(consumer, 'src'), { recursive: true });
  for (const { dir, manifest } of packages) {
    console.log(`Packing ${manifest.name}`);
    run('pnpm', ['pack', '--pack-destination', packed], dir);
  }

  const dependencies = {};
  // The required peers of each external peer, for the standalone installs.
  const peersOf = {};
  // Use the installed lockfile graph, including required peers of external peers.
  function addPeer(name, from) {
    if (expected.has(name) || dependencies[name]) return;
    const require = createRequire(from);
    let dir = dirname(require.resolve(name));
    while (
      !existsSync(resolve(dir, 'package.json')) ||
      readJson(resolve(dir, 'package.json')).name !== name
    ) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`Cannot locate manifest for ${name}`);
      dir = parent;
    }
    const path = resolve(dir, 'package.json');
    const manifest = readJson(path);
    dependencies[name] = manifest.version;
    peersOf[name] = Object.keys(manifest.peerDependencies ?? {}).filter(
      (peer) => !manifest.peerDependenciesMeta?.[peer]?.optional,
    );
    for (const peer of peersOf[name]) addPeer(peer, path);
  }
  const packedDependencies = {};
  const seen = new Set();
  for (const file of readdirSync(packed).filter((name) =>
    name.endsWith('.tgz'),
  )) {
    const path = resolve(packed, file);
    const entries = tar(['-tf', path]).trim().split('\n');
    for (const required of [
      'package.json',
      'README.md',
      'LICENSE',
      'COMMERCIAL_LICENSE.txt',
    ]) {
      if (!entries.includes(`package/${required}`))
        throw new Error(`${file}: missing ${required}`);
    }
    if (
      !entries.some((entry) => /^package\/dist\/.*\.js$/.test(entry)) ||
      !entries.some((entry) => /^package\/dist\/.*\.d\.ts$/.test(entry))
    ) {
      throw new Error(`${file}: missing runtime JS or declarations`);
    }
    if (
      entries.some(
        (entry) =>
          /\.(spec|test)\.[cm]?[jt]sx?$/.test(entry) ||
          /\/(test|tests|__tests__)\//.test(entry),
      )
    ) {
      throw new Error(`${file}: ships test files`);
    }
    const readme = tar(['-xzf', path, '-O', 'package/README.md']);
    if (/\]\(\.\.\//.test(readme)) {
      throw new Error(
        `${file}: README links outside the package, which break on npmjs.com`,
      );
    }
    const manifest = JSON.parse(
      tar(['-xzf', path, '-O', 'package/package.json']),
    );
    const source = expected.get(manifest.name);
    if (
      !source ||
      source.version !== manifest.version ||
      seen.has(manifest.name)
    ) {
      throw new Error(
        `${file}: unexpected, duplicate, or wrong-version package`,
      );
    }
    seen.add(manifest.name);
    packedDependencies[manifest.name] = `file:${path}`;
    const requiredNodeEngine = peerNodeEngines.get(manifest.name) ?? nodeEngine;
    if (manifest.engines?.node !== requiredNodeEngine) {
      throw new Error(
        `${manifest.name}: engines.node must be "${requiredNodeEngine}", found "${manifest.engines?.node}"`,
      );
    }
    // No package depends on NestJS, and pipeline and DDD packages do not depend
    // on each other.
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (
          range.startsWith('workspace:') ||
          /^@?nestjs/.test(name) ||
          (isPipeline(manifest.name) && isDdd(name)) ||
          (isDdd(manifest.name) && isPipeline(name))
        ) {
          throw new Error(
            `${manifest.name}: invalid published dependency ${name}: ${range}`,
          );
        }
      }
    }
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[name]?.optional) continue;
      const sourceDir = packages.find(
        (entry) => entry.manifest.name === manifest.name,
      ).dir;
      addPeer(name, resolve(sourceDir, 'package.json'));
    }
  }
  if (seen.size !== expected.size) {
    throw new Error(
      `Missing tarballs: ${[...expected.keys()].filter((name) => !seen.has(name)).join(', ')}`,
    );
  }

  // pnpm reads overrides from the workspace file only, so a packed package that
  // depends on another packed one resolves to its tarball, never to the registry.
  writeFileSync(
    resolve(consumer, 'pnpm-workspace.yaml'),
    [
      'packages: []',
      'autoInstallPeers: false',
      'strictPeerDependencies: true',
      'linkWorkspacePackages: false',
      'overrides:',
      ...Object.entries(packedDependencies).map(
        ([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
      ),
      '',
    ].join('\n'),
  );
  writeFileSync(
    resolve(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'packed-consumer-smoke',
        private: true,
        version: '1.0.0',
        dependencies: { ...dependencies, ...packedDependencies },
        devDependencies: {
          '@types/node': readJson(
            resolve(root, 'node_modules/@types/node/package.json'),
          ).version,
        },
      },
      null,
      2,
    ),
  );
  for (const file of ['tsconfig.json', 'tsconfig.bundler.json']) {
    copyFileSync(resolve(template, file), resolve(consumer, file));
  }
  const fixtures = existsSync(resolve(template, 'src'))
    ? readdirSync(resolve(template, 'src')).filter((name) =>
        name.endsWith('.ts'),
      )
    : [];
  for (const file of fixtures) {
    copyFileSync(
      resolve(template, 'src', file),
      resolve(consumer, 'src', file),
    );
  }
  // Static namespace imports exercise declarations and survive compilation into
  // CommonJS loads through require().
  writeFileSync(
    resolve(consumer, 'src/all-packages.ts'),
    [...expected.keys()]
      .map(
        (name, index) =>
          `import * as package${index} from ${JSON.stringify(name)};\nconsole.log(${JSON.stringify(name)}, Object.keys(package${index}).length);`,
      )
      .join('\n'),
  );

  // Every entry point, subpaths included, from an ES module consumer and from Bun.
  const entryPoints = [...expected.values()].flatMap((manifest) =>
    Object.keys(manifest.exports ?? { '.': null })
      .filter((key) => key !== './package.json')
      .map((key) =>
        key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`,
      ),
  );
  writeFileSync(
    resolve(consumer, 'src/all-packages.mts'),
    entryPoints
      .map(
        (name, index) =>
          `import * as entry${index} from ${JSON.stringify(name)};\nif (!Object.keys(entry${index}).length) throw new Error(${JSON.stringify(`${name}: no exports`)});\nconsole.log('import', ${JSON.stringify(name)}, Object.keys(entry${index}).length);`,
      )
      .join('\n'),
  );
  writeFileSync(
    resolve(consumer, 'bun-load.mjs'),
    [
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "const names = (namespace) => Object.keys(namespace).filter((key) => !['default', '__esModule', 'module.exports'].includes(key)).sort().join();",
      `for (const name of ${JSON.stringify(entryPoints)}) {`,
      '  const imported = names(await import(name));',
      '  const required = names(require(name));',
      "  if (!imported || imported !== required) throw new Error(name + ': import and require() differ in Bun');",
      "  console.log('bun', name, imported.split(',').length);",
      '}',
    ].join('\n'),
  );

  run(
    'pnpm',
    [
      'install',
      '--prefer-offline',
      '--strict-peer-dependencies',
      '--config.auto-install-peers=false',
    ],
    consumer,
  );
  run(
    resolve(root, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.json'],
    consumer,
  );
  for (const file of ['all-packages.ts', ...fixtures]) {
    run('node', [`dist/${file.replace(/\.ts$/, '.js')}`], consumer);
  }
  run('node', ['dist/all-packages.mjs'], consumer);
  run(
    resolve(root, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.bundler.json'],
    consumer,
  );
  run('bun', ['bun-load.mjs'], consumer);

  // Every package must work with nothing else installed: each gets an empty
  // consumer holding only its tarball, its peers and the packed packages they
  // depend on, and must load without anything more.
  for (const [index, manifest] of [...expected.values()].entries()) {
    const own = Object.keys(manifest.dependencies ?? {});
    const foreign = own.filter((name) => !packedDependencies[name]);
    if (foreign.length) {
      throw new Error(
        `${manifest.name}: depends on packages outside this release: ${foreign.join(', ')}`,
      );
    }
    // The version the package is developed and tested against.
    const sourceDir = packages.find(
      (entry) => entry.manifest.name === manifest.name,
    ).dir;
    // Required peers only: an optional peer (a cache store driver) is the application's choice.
    const peers = Object.keys(manifest.peerDependencies ?? {}).filter(
      (name) => !manifest.peerDependenciesMeta?.[name]?.optional,
    );
    const external = peers.filter((name) => !packedDependencies[name]);
    const externalManifest = (name) =>
      readJson(resolve(sourceDir, 'node_modules', name, 'package.json'));
    // Packed packages reachable from the package and its packed peers.
    const packedClosure = new Set();
    const visit = (name) => {
      if (!packedDependencies[name] || packedClosure.has(name)) return;
      packedClosure.add(name);
      for (const dependency of Object.keys(
        expected.get(name).dependencies ?? {},
      )) {
        visit(dependency);
      }
    };
    for (const name of [manifest.name, ...peers]) visit(name);
    // External peers and, recursively, the required peers they need themselves, including
    // the required peers of a packed peer.
    const peerClosure = new Set();
    const packedPeers = new Set();
    const addClosure = (name) => {
      if (packedDependencies[name]) {
        if (packedPeers.has(name)) return;
        packedPeers.add(name);
        const packedManifest = expected.get(name);
        for (const peer of Object.keys(packedManifest.peerDependencies ?? {})) {
          if (!packedManifest.peerDependenciesMeta?.[peer]?.optional) {
            addClosure(peer);
          }
        }
        return;
      }
      if (peerClosure.has(name)) return;
      peerClosure.add(name);
      for (const peer of peersOf[name] ?? []) addClosure(peer);
    };
    for (const name of peers) addClosure(name);
    const allowed = [
      ...packedClosure,
      ...peerClosure,
      ...external.flatMap((name) =>
        Object.keys(externalManifest(name).dependencies ?? {}),
      ),
    ];
    const overrides = Object.fromEntries(
      [...packedClosure].map((name) => [name, packedDependencies[name]]),
    );
    const alone = resolve(temporary, `standalone-${index}`);
    mkdirSync(alone);
    writeFileSync(
      resolve(alone, 'pnpm-workspace.yaml'),
      [
        'packages: []',
        'autoInstallPeers: false',
        'strictPeerDependencies: true',
        'overrides:',
        ...Object.entries(overrides).map(
          ([name, spec]) =>
            `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
        ),
        '',
      ].join('\n'),
    );
    writeFileSync(
      resolve(alone, 'package.json'),
      JSON.stringify(
        {
          name: 'packed-standalone-smoke',
          private: true,
          version: '1.0.0',
          dependencies: Object.fromEntries(
            [manifest.name, ...new Set([...peers, ...peerClosure])].map(
              (name) => [
                name,
                packedDependencies[name] ??
                  dependencies[name] ??
                  externalManifest(name).version,
              ],
            ),
          ),
        },
        null,
        2,
      ),
    );
    run('pnpm', ['install', '--prefer-offline'], alone);
    const installed = new Set();
    // What an external peer brings, at any depth, is that peer's business.
    const broughtByPeers = new Set();
    const collect = (tree, underPeer = false) => {
      for (const [name, entry] of Object.entries(tree ?? {})) {
        installed.add(name);
        const inside = underPeer || peerClosure.has(name);
        if (inside) broughtByPeers.add(name);
        collect(entry.dependencies, inside);
      }
    };
    const projects = JSON.parse(
      execFileSync('pnpm', ['ls', '--json', '--depth', 'Infinity'], {
        cwd: alone,
        encoding: 'utf8',
      }),
    );
    for (const project of projects) collect(project.dependencies);
    const extra = [...installed].filter(
      (name) => !allowed.includes(name) && !broughtByPeers.has(name),
    );
    if (extra.length) {
      throw new Error(
        `${manifest.name}: standalone install also installed ${extra.join(', ')}`,
      );
    }

    const entries = Object.keys(manifest.exports ?? { '.': null })
      .filter((key) => key !== './package.json')
      .map((key) =>
        key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`,
      );
    run(
      'node',
      [
        '-e',
        `for (const s of ${JSON.stringify(entries)}) { const n = Object.keys(require(s)).length; if (!n) throw new Error(s + ': no exports'); console.log('standalone', s, n); }`,
      ],
      alone,
    );
  }
  console.log(
    `Release verification passed: ${seen.size} packed packages, each installed alone; CommonJS and ES module consumers, Bundler types, Bun.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
