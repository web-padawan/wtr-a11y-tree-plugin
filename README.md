# wtr-a11y-tree-plugin

Read the Chrome accessibility tree in Web Test Runner tests.

The package has three parts:

- Server plugin that reads a11y tree through the Chrome DevTools Protocol.
- `getA11yTree()` browser command that returns the tree of an element.
- Chai assertions: `matchA11yTree()` and `equalA11yTreeSnapshot()`.

## Install

```sh
npm install --save-dev wtr-a11y-tree-plugin
```

Pre-requisites: `@web/test-runner` and `@web/test-runner-playwright` (Chrome only).

## Configuration

Add the plugin to the Web Test Runner config:

```js
import { playwrightLauncher } from '@web/test-runner-playwright';
import { a11yTreePlugin } from 'wtr-a11y-tree-plugin';

export default {
  nodeResolve: true,
  browsers: [playwrightLauncher({ product: 'chromium' })],
  plugins: [a11yTreePlugin()],
};
```

Set `channel: 'chrome'` to use local Chrome e.g. in GitHub Actions:

```js
import { playwrightLauncher } from '@web/test-runner-playwright';
import { a11yTreePlugin } from 'wtr-a11y-tree-plugin';

export default {
  nodeResolve: true,
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        channel: 'chrome',
        headless: true,
      },
    }),
  ],
  plugins: [a11yTreePlugin()],
};
```

Note: snapshots can differ depending on the Chrome or Playwright Chromium version.

## Getting a11y tree

Call `getA11yTree()` with an element. The result is a list of `A11yNode` objects.

```js
import { getA11yTree } from 'wtr-a11y-tree-plugin/browser';

const tree = await getA11yTree(document.querySelector('my-button'));
```

Each node has these fields:

- `role`: the accessibility role.
- `name`: the accessible name.
- `value`: the value, when there is one.
- `description`: the accessible description, when there is one.
- `states`: the states, such as `expanded` or `pressed`.
- `relations`: the targets of `controls`, `owns` and similar relations, as `{ role, name }`.
- `children`: the child nodes.

Text nodes have the role `text` and only a name.

## Chai assertions

Register the plugin with `chai.use()`. The plugin does not import chai. It uses the chai instance that you pass.

```js
import * as chai from 'chai';
import { chaiA11yTree } from 'wtr-a11y-tree-plugin/chai';

chai.use(chaiA11yTree);
const { expect } = chai;

it('exposes the combobox', async () => {
  await expect(element).to.matchA11yTree(`
    - combobox "Size" [expanded]:
      - /value: Medium
  `);
});

it('keeps the tree', async () => {
  await expect(element).to.equalA11yTreeSnapshot();
});
```

TypeScript users need `@types/chai`. The `wtr-a11y-tree-plugin/chai` module adds both methods to `Chai.Assertion`.

## Snapshot format

The format follows Playwright aria snapshots. Each line is a node.

```text
- text: Size
- combobox "Size" [haspopup=listbox, expanded]:
  - /value: Medium
  - /activedescendant: option "Medium"
  - /controls: listbox "Size"
- listbox "Size" [orientation=vertical]:
  - option "Small"
  - option "Medium" [selected]
```

The rules are:

- **Role and name**: A node starts with its role. The name follows in double quotes.
- **States**: States appear in square brackets. A true state prints its lowercase name. Other states print as `name=value`.
- **False states**: Only `expanded=false` and `pressed=false` print. Other false states do not.
- **Value**: A value prints as `/value`. A single text child prints as an inline value.
- **Description**: A description prints as `/description`.
- **Relations**: Each relation target prints as `/relation: role "name"`.

## Matching rules

`matchA11yTree()` checks that the expected tree is a subset of the actual tree. It does not require an exact match.

- **Subset**: The actual tree may have more nodes, states and properties.
- **Order**: Expected siblings must appear in the same order as in the actual tree.
- **Depth**: The first level of the expected tree may match nodes at any depth. Nested levels must match children.
- **Omitted parts**: A name or value that you do not write matches anything.

When the match fails, the assertion error holds the serialized actual tree. Test reporters show the difference.

## Other exports

The `wtr-a11y-tree-plugin/format` module runs in the browser and in Node. It exports these functions:

- `serializeA11yTree(nodes)`: converts `A11yNode[]` to the snapshot text.
- `parseDisplayTree(text)`: parses the snapshot text.
- `matchDisplayList(expected, actual, deep)`: applies the matching rules.
- `dedent(text)`: removes the common indentation of a template literal.

## Limitations

- Works in Playwright Chromium and Chrome only. Puppeteer and `@web/test-runner-chrome` are not supported.
- `equalA11yTreeSnapshot()` works in Mocha tests only. It uses the snapshot support of Web Test Runner.
- Pass `--update-snapshots` to Web Test Runner to rewrite saved snapshots.

## License

MIT
