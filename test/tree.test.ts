import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toA11yTree } from '../src/tree.ts';

type AXNode = Parameters<typeof toA11yTree>[0][number];

type Spec = {
  id: string;
  role: string;
  name?: string;
  childIds?: string[];
  ignored?: boolean;
  value?: string | number;
  description?: string;
  properties?: AXNode['properties'];
};

// Backend IDs are the numeric part of the node ID plus 100.
const ax = ({ id, role, name, childIds, ignored, value, description, properties }: Spec): AXNode => ({
  nodeId: id,
  ignored: !!ignored,
  role: { type: 'role', value: role },
  name: name === undefined ? undefined : { type: 'computedString', value: name },
  value: value === undefined ? undefined : { type: 'string', value },
  description: description === undefined ? undefined : { type: 'computedString', value: description },
  childIds,
  properties,
  backendDOMNodeId: Number(id) + 100,
});

const prop = (name: string, value: unknown): NonNullable<AXNode['properties']>[number] =>
  ({ name, value: { type: 'string', value } }) as NonNullable<AXNode['properties']>[number];

describe('toA11yTree', () => {
  it('drops ignored nodes and moves their children to the parent', () => {
    const nodes = [
      ax({ id: '1', role: 'group', name: 'G', childIds: ['2'] }),
      ax({ id: '2', role: 'button', name: 'Hidden parent', ignored: true, childIds: ['3'] }),
      ax({ id: '3', role: 'link', name: 'L' }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101), [
      {
        role: 'group',
        name: 'G',
        states: {},
        relations: {},
        children: [{ role: 'link', name: 'L', states: {}, relations: {}, children: [] }],
      },
    ]);
  });

  it('drops unnamed generic nodes and keeps named ones', () => {
    const nodes = [
      ax({ id: '1', role: 'group', name: 'G', childIds: ['2', '3'] }),
      ax({ id: '2', role: 'generic', childIds: ['4'] }),
      ax({ id: '3', role: 'generic', name: 'Named' }),
      ax({ id: '4', role: 'link', name: 'L' }),
    ];
    const [group] = toA11yTree(nodes, 101);
    assert.deepEqual(
      group.children!.map(({ role, name }) => `${role}:${name}`),
      ['link:L', 'generic:Named'],
    );
  });

  it('drops InlineTextBox, LabelText, LineBreak and none, and keeps their children', () => {
    const nodes = [
      ax({ id: '1', role: 'group', name: 'G', childIds: ['2', '3', '4', '5'] }),
      ax({ id: '2', role: 'InlineTextBox', name: 'x' }),
      ax({ id: '3', role: 'LabelText', childIds: ['6'] }),
      ax({ id: '4', role: 'LineBreak', name: '\n' }),
      ax({ id: '5', role: 'none', childIds: ['7'] }),
      ax({ id: '6', role: 'StaticText', name: 'Label' }),
      ax({ id: '7', role: 'link', name: 'L' }),
    ];
    const [group] = toA11yTree(nodes, 101);
    assert.deepEqual(group.children, [
      { role: 'text', name: 'Label' },
      { role: 'link', name: 'L', states: {}, relations: {}, children: [] },
    ]);
  });

  it('gives leaf roles no children', () => {
    const nodes = [
      ax({ id: '1', role: 'combobox', name: 'Size', childIds: ['2'] }),
      ax({ id: '2', role: 'StaticText', name: 'Medium' }),
      ax({ id: '3', role: 'textbox', name: 'T', childIds: ['2'] }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].children, []);
    assert.deepEqual(toA11yTree(nodes, 103)[0].children, []);
  });

  it('joins text siblings of one dropped container with one space', () => {
    const nodes = [
      ax({ id: '1', role: 'group', name: 'G', childIds: ['2', '5'] }),
      ax({ id: '2', role: 'generic', childIds: ['3', '4'] }),
      ax({ id: '3', role: 'StaticText', name: 'Hello' }),
      ax({ id: '4', role: 'StaticText', name: 'world' }),
      ax({ id: '5', role: 'StaticText', name: 'Other' }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].children, [
      { role: 'text', name: 'Hello world' },
      { role: 'text', name: 'Other' },
    ]);
  });

  it('drops empty StaticText', () => {
    const nodes = [
      ax({ id: '1', role: 'group', name: 'G', childIds: ['2'] }),
      ax({ id: '2', role: 'StaticText', name: '' }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].children, []);
  });

  it('keeps allowed states only', () => {
    const nodes = [
      ax({
        id: '1',
        role: 'button',
        name: 'B',
        properties: [prop('pressed', true), prop('focusable', true), prop('level', 2), prop('editable', 'plaintext')],
      }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].states, { pressed: true, level: 2 });
  });

  it('resolves relations to role and name and skips unknown targets', () => {
    const nodes = [
      ax({
        id: '1',
        role: 'combobox',
        name: 'Size',
        properties: [
          {
            name: 'controls',
            value: { type: 'nodeList', relatedNodes: [{ backendDOMNodeId: 102 }, { backendDOMNodeId: 999 }] },
          },
          { name: 'owns', value: { type: 'nodeList' } },
        ],
      }),
      ax({ id: '2', role: 'listbox', name: 'Size list' }),
      ax({ id: '3', role: 'option' }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].relations, { controls: [{ role: 'listbox', name: 'Size list' }] });
  });

  it('resolves a target without a name to an empty name', () => {
    const nodes = [
      ax({
        id: '1',
        role: 'combobox',
        name: 'Size',
        properties: [{ name: 'activedescendant', value: { type: 'idref', relatedNodes: [{ backendDOMNodeId: 103 }] } }],
      }),
      ax({ id: '3', role: 'option' }),
    ];
    assert.deepEqual(toA11yTree(nodes, 101)[0].relations, { activedescendant: [{ role: 'option', name: '' }] });
  });

  it('drops empty values and descriptions, and stringifies numeric values', () => {
    const nodes = [
      ax({ id: '1', role: 'slider', name: 'S', value: 5, description: '' }),
      ax({ id: '2', role: 'textbox', name: 'T', value: '', description: 'Help' }),
    ];
    const [slider] = toA11yTree(nodes, 101);
    assert.equal(slider.value, '5');
    assert.equal('description' in slider, false);
    const [textbox] = toA11yTree(nodes, 102);
    assert.equal('value' in textbox, false);
    assert.equal(textbox.description, 'Help');
  });

  it('returns an empty list for an unknown backend node ID', () => {
    const nodes = [ax({ id: '1', role: 'button', name: 'B' })];
    assert.deepEqual(toA11yTree(nodes, 12345), []);
  });
});
