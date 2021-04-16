# Internet Archive Local Cache

A browser-based cache to store, retrieve, and expire key-value pairs. Built on IndexedDB.

## Installation
```bash
yarn add @internetarchive/local-cache
```

## Usage

```js
import { LocalCache } from '@internetarchive/local-cache';

const localCache = new LocalCache();

// set a value
await localCache.set({
  key: 'foo',
  value: 'bar',
  ttl: 10 // in seconds
})

// get a value
let cachedValue = await localCache.get('foo');
console.debug(cachedValue) // 'bar'

// delete a value
await localCache.delete('foo');

cachedValue = await localCache.get('foo');
console.debug(cachedValue) // undefined
```

## Advanced Usage

### Customize the namespace and default TTL
```js
const localCache = new LocalCache({
  namespace: 'MyCustomNamespace',
  defaultTTL: 30 * 60  // 30 minutes
});
```

## Local Demo with `web-dev-server`
```bash
yarn start
```
To run a local development server that serves the basic demo located in `demo/index.html`

## Testing with Web Test Runner
To run the suite of Web Test Runner tests, run
```bash
yarn run test
```

To run the tests in watch mode (for &lt;abbr title=&#34;test driven development&#34;&gt;TDD&lt;/abbr&gt;, for example), run

```bash
yarn run test:watch
```

## Linting with ESLint, Prettier, and Types
To scan the project for linting errors, run
```bash
yarn run lint
```

You can lint with ESLint and Prettier individually as well
```bash
yarn run lint:eslint
```
```bash
yarn run lint:prettier
```

To automatically fix many linting errors, run
```bash
yarn run format
```

You can format using ESLint and Prettier individually as well
```bash
yarn run format:eslint
```
```bash
yarn run format:prettier
```

## Tooling configs

For most of the tools, the configuration is in the `package.json` to reduce the amount of files in your project.

If you customize the configuration a lot, you can consider moving them to individual files.
