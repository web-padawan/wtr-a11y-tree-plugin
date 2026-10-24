/**
 * `toA11yTree()` is copied from vaadin/web-components wtr-utils.js
 * on proto/aria-snapshot at a9833531f6.
 */
import type { CDPSession } from 'playwright-core';
import type { A11yNode } from './types.ts';

// `playwright-core` does not export its `Protocol` types, so take the node type from `CDPSession`.
declare const cdp: CDPSession;
declare const fullAXTree: ReturnType<typeof cdp.send<'Accessibility.getFullAXTree'>>;
type AXNode = Awaited<typeof fullAXTree>['nodes'][number];

// Accessibility tree properties kept in `get-a11y-tree` results. Others,
// such as `focusable` or `editable`, are set on most nodes and add noise.
const A11Y_TREE_STATES = new Set([
  'autocomplete',
  'checked',
  'disabled',
  'expanded',
  'hasPopup',
  'invalid',
  'level',
  'modal',
  'multiselectable',
  'orientation',
  'pressed',
  'readonly',
  'required',
  'selected',
  'valuemax',
  'valuemin',
  'valuetext',
]);

const A11Y_TREE_RELATIONS = new Set(['activedescendant', 'controls', 'details', 'errormessage', 'owns']);

// Roles with no meaningful descendants: their text is already in the name or value.
const A11Y_TREE_LEAF_ROLES = new Set([
  'checkbox',
  'combobox',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'textbox',
]);

// Roles that only add noise to the tree. Their children are kept.
const A11Y_TREE_SKIPPED_ROLES = new Set(['InlineTextBox', 'LabelText', 'LineBreak', 'none']);

/**
 * Converts the CDP accessibility tree below the given DOM node into a list of
 * plain nodes. Ignored nodes, unnamed generic containers and noisy roles are
 * skipped, and their children move up. Relations are resolved to the role and
 * name of the target, as generated IDs change between runs.
 */
export const toA11yTree = (axNodes: AXNode[], backendNodeId: number): A11yNode[] => {
  const byId = new Map(axNodes.map((node) => [node.nodeId, node]));
  const byBackendId = new Map(axNodes.map((node) => [node.backendDOMNodeId, node]));

  const describe = (node: AXNode) => ({
    role: String(node.role?.value),
    name: node.name?.value ?? '',
  });

  const convert = (node: AXNode): A11yNode[] => {
    const role: string | undefined = node.role?.value;
    const name: string = node.name?.value ?? '';
    const children = A11Y_TREE_LEAF_ROLES.has(role as string)
      ? []
      : (node.childIds || []).flatMap((id) => (byId.has(id) ? convert(byId.get(id)!) : []));

    if (node.ignored || A11Y_TREE_SKIPPED_ROLES.has(role as string) || (role === 'generic' && !name)) {
      // Join the text of one container, such as a label, into one node. Text
      // from different containers stays separate.
      if (children.length > 1 && children.every((child) => child.role === 'text')) {
        return [{ role: 'text', name: children.map((child) => child.name).join(' ') }];
      }
      return children;
    }

    if (role === 'StaticText') {
      return name ? [{ role: 'text', name }] : [];
    }

    const states: NonNullable<A11yNode['states']> = {};
    const relations: NonNullable<A11yNode['relations']> = {};
    const result: A11yNode = { role: role as string, name, states, relations, children };
    const value = node.value?.value;
    if (value !== undefined && value !== '') {
      result.value = String(value);
    }
    if (node.description?.value) {
      result.description = node.description.value;
    }
    (node.properties || []).forEach(({ name: key, value: { value: stateValue, relatedNodes } }) => {
      if (A11Y_TREE_STATES.has(key)) {
        states[key] = stateValue;
      } else if (A11Y_TREE_RELATIONS.has(key) && relatedNodes) {
        relations[key] = relatedNodes
          .map((related) => byBackendId.get(related.backendDOMNodeId))
          .filter((related) => !!related)
          .map(describe);
      }
    });
    return [result];
  };

  const root = byBackendId.get(backendNodeId);
  return root ? convert(root) : [];
};
