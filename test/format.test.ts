import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedent, matchDisplayList, parseDisplayTree, serializeA11yTree, toDisplayTree } from '../src/format.ts';
import type { A11yNode } from '../src/types.ts';

const node = (role: string, name: string, extra: Partial<A11yNode> = {}): A11yNode => ({
  role,
  name,
  states: {},
  relations: {},
  children: [],
  ...extra,
});

const matches = (expected: string, actual: string, deep = false) =>
  matchDisplayList(parseDisplayTree(expected), parseDisplayTree(actual), deep);

describe('serializeA11yTree', () => {
  it('prints names, states, value, description and relations', () => {
    const tree = [
      node('combobox', 'Size', {
        value: 'Medium',
        description: 'Pick one',
        states: { hasPopup: 'listbox', expanded: true, level: 2 },
        relations: { controls: [{ role: 'listbox', name: 'Size' }], owns: [{ role: 'option', name: '' }] },
      }),
    ];
    assert.equal(
      serializeA11yTree(tree),
      [
        '- combobox "Size" [haspopup=listbox, expanded, level=2]:',
        '  - /value: Medium',
        '  - /description: Pick one',
        '  - /controls: listbox "Size"',
        '  - /owns: option',
      ].join('\n'),
    );
  });

  it('prints expanded=false and pressed=false but no other false state', () => {
    const tree = [
      node('button', 'B', { states: { expanded: false, pressed: false, checked: false, disabled: 'false' } }),
    ];
    assert.equal(serializeA11yTree(tree), '- button "B" [expanded=false, pressed=false]');
  });

  it('drops text that equals the parent name', () => {
    const tree = [node('button', 'Save', { children: [{ role: 'text', name: 'Save' }] })];
    assert.equal(serializeA11yTree(tree), '- button "Save"');
  });

  it('prints a single other text child as the inline value', () => {
    const tree = [node('option', 'Opt', { children: [{ role: 'text', name: 'Details' }] })];
    assert.equal(serializeA11yTree(tree), '- option "Opt": Details');
  });

  it('quotes text with special characters', () => {
    assert.equal(serializeA11yTree([{ role: 'text', name: 'a: b' }]), '- text: "a: b"');
    assert.equal(serializeA11yTree([{ role: 'text', name: '42' }]), '- text: "42"');
  });

  it('nests children by two spaces', () => {
    const tree = [node('list', 'L', { children: [node('listitem', 'One'), node('listitem', 'Two')] })];
    assert.equal(serializeA11yTree(tree), ['- list "L":', '  - listitem "One"', '  - listitem "Two"'].join('\n'));
  });
});

describe('parseDisplayTree', () => {
  it('throws on a line that does not parse', () => {
    assert.throws(() => parseDisplayTree('- button "B" garbage here'), /Cannot parse accessibility tree line/);
  });

  it('parses roles, names, states, values and properties', () => {
    const [combobox] = parseDisplayTree(`
      - combobox "Size" [expanded, haspopup=listbox]:
        - /value: Medium
        - /controls: listbox "Size"
        - option "Small"
    `);
    assert.equal(combobox.role, 'combobox');
    assert.equal(combobox.name, 'Size');
    assert.deepEqual(combobox.states, ['expanded', 'haspopup=listbox']);
    assert.equal(combobox.value, 'Medium');
    assert.deepEqual(combobox.props, [['controls', 'listbox "Size"']]);
    assert.equal(combobox.children[0].role, 'option');
  });

  it('leaves unwritten names undefined', () => {
    assert.equal(parseDisplayTree('- button')[0].name, undefined);
  });
});

describe('dedent', () => {
  it('removes common indentation and blank first and last lines', () => {
    assert.equal(dedent('\n    - a\n      - b\n  '), '- a\n  - b');
  });
});

describe('matchDisplayList', () => {
  const actual = `
    - heading "Title"
    - button "Save" [pressed]
    - button "Cancel"
  `;

  it('passes on a subset in the same order', () => {
    assert.equal(matches('- heading "Title"\n- button "Cancel"', actual), true);
  });

  it('fails on the wrong order', () => {
    assert.equal(matches('- button "Cancel"\n- heading "Title"', actual), false);
  });

  it('fails on a missing state', () => {
    assert.equal(matches('- button "Cancel" [pressed]', actual), false);
    assert.equal(matches('- button "Save" [pressed]', actual), true);
  });

  it('matches a node at any depth with deep only', () => {
    const nested = `
      - group "G":
        - list "L":
          - listitem "One"
    `;
    assert.equal(matches('- listitem "One"', nested), false);
    assert.equal(matches('- listitem "One"', nested, true), true);
  });

  it('matches children as a subset in order', () => {
    const nested = `
      - list "L":
        - listitem "One"
        - listitem "Two"
        - listitem "Three"
    `;
    assert.equal(matches('- list "L":\n  - listitem "One"\n  - listitem "Three"', nested), true);
    assert.equal(matches('- list "L":\n  - listitem "Three"\n  - listitem "One"', nested), false);
  });
});

describe('round trip', () => {
  it('matches a serialized tree against itself', () => {
    const tree = [
      node('combobox', 'Size', {
        value: 'Medium',
        states: { expanded: true },
        relations: { controls: [{ role: 'listbox', name: 'Size' }] },
      }),
      node('listbox', 'Size', {
        children: [node('option', 'Small'), node('option', 'Medium', { states: { selected: true } })],
      }),
    ];
    const yaml = serializeA11yTree(tree);
    assert.equal(matchDisplayList(parseDisplayTree(yaml), toDisplayTree(tree), true), true);
    assert.equal(matchDisplayList(parseDisplayTree(yaml), parseDisplayTree(yaml)), true);
  });
});
