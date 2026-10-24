/**
 * Copied from vaadin/web-components test/plugins/index.js
 * on proto/aria-snapshot at a9833531f6.
 */
import type { A11yNode } from './types.ts';

export type DisplayNode = {
  role: string;
  name?: string;
  states: string[];
  value?: string;
  props: Array<[string, string]>;
  children: DisplayNode[];
};

// States printed even when `false`, as `false` differs from a missing state.
const A11Y_FALSE_STATES = new Set(['expanded', 'pressed']);

// Snapshots are stored in template literals, which turn escape sequences
// into characters on read, so quote without escaping.
const quote = (text: string) => `"${text}"`;

const formatText = (text: string) => (/^[\w$.,!?()•@ ]+$/u.test(text) && !/^\d/u.test(text) ? text : quote(text));

const formatStates = (node: A11yNode) =>
  Object.entries(node.states || {})
    .map(([key, value]) => {
      if (value === true || value === 'true') {
        return key.toLowerCase();
      }
      if (value === false || value === 'false') {
        return A11Y_FALSE_STATES.has(key) ? `${key}=false` : null;
      }
      if (value === '' || (key === 'valuetext' && String(value) === node.value)) {
        return null;
      }
      return `${key.toLowerCase()}=${value}`;
    })
    .filter((state) => state !== null);

/**
 * Removes text that repeats the parent name, such as the label of a button.
 */
const normalizeChildren = (children: A11yNode[] | undefined, parentName?: string) =>
  (children || []).filter((child) => !(child.role === 'text' && child.name === parentName));

/**
 * Converts the tree returned by `getA11yTree()` into the nodes that the
 * snapshot prints: formatted states, descriptions and relations as properties,
 * and a single text child as the inline value.
 */
export const toDisplayTree = (nodes: A11yNode[]): DisplayNode[] =>
  normalizeChildren(nodes).map((node) => {
    if (node.role === 'text') {
      return { role: 'text', name: node.name, states: [], props: [], children: [] };
    }
    let children = normalizeChildren(node.children, node.name);
    let value = node.value;
    if (value === undefined && children.length === 1 && children[0].role === 'text') {
      value = children[0].name;
      children = [];
    }
    const props: Array<[string, string]> = [];
    if (node.description) {
      props.push(['description', node.description]);
    }
    Object.entries(node.relations || {}).forEach(([key, targets]) => {
      targets.forEach(({ role, name }) => {
        props.push([key, `${role}${name ? ` ${quote(name)}` : ''}`]);
      });
    });
    return {
      role: node.role,
      name: node.name,
      states: formatStates(node),
      value,
      props,
      children: toDisplayTree(children),
    };
  });

/**
 * Serializes an accessibility tree to YAML in the format of Playwright aria
 * snapshots. Descriptions and relations are printed as `/description` and
 * `/<relation>` properties, like `/url` in Playwright.
 */
export const serializeDisplayTree = (nodes: DisplayNode[], indent = ''): string =>
  nodes
    .map((node) => {
      if (node.role === 'text') {
        return `${indent}- text: ${formatText(node.name!)}`;
      }
      let line = `${indent}- ${node.role}`;
      if (node.name) {
        line += ` ${quote(node.name)}`;
      }
      if (node.states.length) {
        line += ` [${node.states.join(', ')}]`;
      }
      const props = node.props.map(
        ([key, value]) => `${indent}  - /${key}: ${key === 'description' ? formatText(value) : value}`,
      );
      const nested = node.children.length ? serializeDisplayTree(node.children, `${indent}  `) : '';
      if (!props.length && !nested) {
        return node.value === undefined ? line : `${line}: ${formatText(node.value)}`;
      }
      const head = node.value === undefined ? `${line}:` : `${line}:\n${indent}  - /value: ${formatText(node.value)}`;
      return [head, ...props, nested].filter(Boolean).join('\n');
    })
    .join('\n');

export const serializeA11yTree = (nodes: A11yNode[]): string => serializeDisplayTree(toDisplayTree(nodes));

const unquote = (text: string) =>
  text.length > 1 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;

/**
 * Removes the common indentation and the blank first and last lines of a
 * template literal.
 */
export const dedent = (text: string): string => {
  const lines = text.replace(/^\s*\n|\n\s*$/gu, '').split('\n');
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */u)![0].length));
  return lines.map((line) => line.slice(indent)).join('\n');
};

const NODE_PATTERN = /^(?<role>[\w-]+)(?: "(?<name>[^"]*)")?(?: \[(?<states>[^\]]*)\])?(?::(?: (?<value>.+))?)?$/u;

// A node being parsed. Text nodes have no states, properties or children.
type ParsedNode = Pick<DisplayNode, 'role' | 'name' | 'value'> &
  Partial<Pick<DisplayNode, 'states' | 'props' | 'children'>>;

/**
 * Parses a tree in the snapshot format into display nodes. Values that are
 * not written, such as a missing name, are left undefined and match anything.
 */
export const parseDisplayTree = (text: string): DisplayNode[] => {
  const root: Pick<ParsedNode, 'children'> & Partial<Pick<ParsedNode, 'props' | 'value'>> = { children: [] };
  const stack = [{ indent: -1, node: root as Partial<ParsedNode> }];
  dedent(text)
    .split('\n')
    .filter((line) => line.trim())
    .forEach((line) => {
      const indent = line.match(/^ */u)![0].length;
      const content = line.trim().replace(/^- /u, '');
      while (stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].node;
      const prop = content.match(/^\/(?<key>[\w-]+): (?<value>.+)$/u);
      if (prop) {
        const { key, value } = prop.groups!;
        if (key === 'value') {
          parent.value = unquote(value);
        } else {
          parent.props!.push([key, key === 'description' ? unquote(value) : value]);
        }
        return;
      }
      const match = content.match(NODE_PATTERN);
      if (!match) {
        throw new Error(`Cannot parse accessibility tree line: ${line}`);
      }
      const { role, name, states, value } = match.groups!;
      const node: ParsedNode =
        role === 'text'
          ? { role, name: value === undefined ? undefined : unquote(value) }
          : {
              role,
              name,
              states: states ? states.split(', ') : [],
              value: value === undefined ? undefined : unquote(value),
              props: [],
              children: [],
            };
      parent.children!.push(node as DisplayNode);
      stack.push({ indent, node });
    });
  return root.children!;
};

/**
 * Lists the nodes of a tree in document order, each with the index after its
 * subtree, so that a match can skip the rest of the subtree.
 */
const flattenDisplayTree = (
  nodes: DisplayNode[],
  result: Array<{ node: DisplayNode; end: number }> = [],
): Array<{ node: DisplayNode; end: number }> => {
  nodes.forEach((node) => {
    const entry = { node, end: 0 };
    result.push(entry);
    flattenDisplayTree(node.children || [], result);
    entry.end = result.length;
  });
  return result;
};

/**
 * Checks that the expected nodes appear in the actual nodes in the same order.
 * Other nodes, states and properties are allowed. With `deep`, an expected node
 * can match an actual node at any depth, which is used for the top level only,
 * so that the expected tree can start below containers.
 */
export function matchDisplayList(expected: DisplayNode[], actual: DisplayNode[], deep = false): boolean {
  const matchNode = (exp: DisplayNode, act: DisplayNode): boolean =>
    exp.role === act.role &&
    (exp.name === undefined || exp.name === act.name) &&
    (exp.role === 'text' ||
      ((exp.value === undefined || exp.value === act.value) &&
        exp.states.every((state) => act.states.includes(state)) &&
        exp.props.every(([key, value]) => act.props.some(([k, v]) => k === key && v === value)) &&
        matchDisplayList(exp.children, act.children)));

  const flat = deep ? flattenDisplayTree(actual) : actual.map((node, i) => ({ node, end: i + 1 }));
  let cursor = 0;
  return expected.every((node) => {
    const index = flat.findIndex((entry, i) => i >= cursor && matchNode(node, entry.node));
    if (index === -1) {
      return false;
    }
    cursor = flat[index].end;
    return true;
  });
}
