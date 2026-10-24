/**
 * `getA11yTree()` is copied from vaadin/web-components test/test-runner-commands/index.js
 * on proto/aria-snapshot at a9833531f6.
 */
import { executeServerCommand } from '@web/test-runner-commands';
import type { A11yNode, A11yTreePayload } from './types.ts';

export type { A11yNode } from './types.ts';

declare global {
  var __a11yTreeTargets: Map<string, Element> | undefined;
}

let a11yTreeId = 0;

/**
 * Returns the Chromium accessibility tree of an element: the roles, names,
 * descriptions, values, states and relations of the element and its
 * descendants, including shadow DOM and slotted content.
 *
 * @example
 * const tree = await getA11yTree(document.querySelector('vaadin-text-field'));
 */
export async function getA11yTree(element: Element): Promise<A11yNode[]> {
  a11yTreeId += 1;
  const id = `${a11yTreeId}`;
  // Commands can only receive JSON, so the server reads the element from a global map.
  globalThis.__a11yTreeTargets ||= new Map();
  globalThis.__a11yTreeTargets.set(id, element);
  try {
    return (await executeServerCommand('get-a11y-tree', { id } satisfies A11yTreePayload)) as A11yNode[];
  } finally {
    globalThis.__a11yTreeTargets.delete(id);
  }
}
