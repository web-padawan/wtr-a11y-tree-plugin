/**
 * `a11yTreePlugin()` is copied from vaadin/web-components wtr-utils.js
 * on proto/aria-snapshot at a9833531f6.
 */
import type { TestRunnerPlugin } from '@web/test-runner';
import type { PlaywrightLauncher } from '@web/test-runner-playwright';
import { toA11yTree } from './tree.ts';
import type { A11yTreePayload } from './types.ts';

export type { A11yNode } from './types.ts';

/**
 * A test runner command that returns the Chromium accessibility tree of the
 * element marked by `getA11yTree()`. It works in Playwright Chromium only.
 */
export const a11yTreePlugin = (): TestRunnerPlugin<A11yTreePayload> => ({
  name: 'a11y-tree-command',
  async executeCommand({ command, payload, session }) {
    if (command !== 'get-a11y-tree') {
      return undefined;
    }
    const { id } = payload!;
    const browser = session.browser as PlaywrightLauncher;
    if (browser.type !== 'playwright' || browser.name !== 'Chromium') {
      throw new Error(`Accessibility tree is not supported for browser ${browser.name}.`);
    }
    const page = browser.getPage(session.id);
    const cdp = await page.context().newCDPSession(page);
    try {
      // The browser side stores the element in a global map, which also works
      // for elements inside shadow roots.
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `globalThis.__a11yTreeTargets.get(${JSON.stringify(id)})`,
      });
      if (!result.objectId) {
        throw new Error(`Cannot find the element for accessibility tree request ${id}.`);
      }
      const { node } = await cdp.send('DOM.describeNode', { objectId: result.objectId });
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      return toA11yTree(nodes, node.backendNodeId);
    } finally {
      await cdp.detach();
    }
  },
});
