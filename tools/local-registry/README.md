# Local registry

A Verdaccio npm registry on `http://127.0.0.1:4873/`, for installing the packages in
another project exactly as they will be published, without publishing them to npm.
`@cqrs-ddd/*` is served only from this registry; everything else is proxied from
npmjs.org.

## Start and stop

```bash
docker compose -f tools/local-registry/compose.yaml up -d
docker compose -f tools/local-registry/compose.yaml down      # keeps the packages
docker compose -f tools/local-registry/compose.yaml down -v   # erases them
```

## Log in once

Publishing needs a user. Create one and keep its token in a config file outside the
repository (`~/.npmrc-local` below); never commit it.

```bash
curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"name":"local","password":"<choose one>"}' \
  http://127.0.0.1:4873/-/user/org.couchdb.user:local
# copy the "token" from the answer
printf 'registry=http://127.0.0.1:4873/\n//127.0.0.1:4873/:_authToken=<token>\n' > ~/.npmrc-local
```

## Publish the packages here

From the repository root, after `pnpm install`:

```bash
pnpm copy-licenses
NPM_CONFIG_USERCONFIG=~/.npmrc-local pnpm -r publish \
  --registry http://127.0.0.1:4873/ --no-git-checks --tag next --access public
```

A version can be published once; to publish it again after a fix, remove it first:

```bash
NPM_CONFIG_USERCONFIG=~/.npmrc-local npm unpublish @cqrs-ddd/<name>@0.5.0 --force \
  --registry http://127.0.0.1:4873/
```

## Install from it

In the consuming project, a `.npmrc` with `registry=http://127.0.0.1:4873/` makes
`pnpm install` or `npm install` take `@cqrs-ddd/*` from here. The web page at
`http://127.0.0.1:4873/` lists what is published.
