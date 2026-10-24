import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { a11yTreePlugin } from '../src/index.ts';

type Command = { command: string; payload: { id: string }; session: unknown };

const run = async (args: Command) => a11yTreePlugin().executeCommand!(args as never);

describe('a11yTreePlugin', () => {
  it('returns undefined for other commands', async () => {
    assert.equal(await run({ command: 'other', payload: { id: '1' }, session: {} }), undefined);
  });

  it('throws for a browser that is not Playwright', async () => {
    const session = { id: 's', browser: { type: 'puppeteer', name: 'Chrome' } };
    await assert.rejects(
      run({ command: 'get-a11y-tree', payload: { id: '1' }, session }),
      /Accessibility tree is not supported for browser Chrome\./,
    );
  });

  it('throws for Playwright Firefox', async () => {
    const session = { id: 's', browser: { type: 'playwright', name: 'Firefox' } };
    await assert.rejects(
      run({ command: 'get-a11y-tree', payload: { id: '1' }, session }),
      /Accessibility tree is not supported for browser Firefox\./,
    );
  });

  it('detaches the CDP session after an error', async () => {
    let detached = 0;
    const cdp = {
      send: async () => {
        throw new Error('boom');
      },
      detach: async () => {
        detached += 1;
      },
    };
    const page = { context: () => ({ newCDPSession: async () => cdp }) };
    const session = { id: 's', browser: { type: 'playwright', name: 'Chromium', getPage: () => page } };
    await assert.rejects(run({ command: 'get-a11y-tree', payload: { id: '1' }, session }), /boom/);
    assert.equal(detached, 1);
  });

  it('throws a clear error when the element is missing, and detaches', async () => {
    let detached = 0;
    const cdp = {
      send: async () => ({ result: {} }),
      detach: async () => {
        detached += 1;
      },
    };
    const page = { context: () => ({ newCDPSession: async () => cdp }) };
    const session = { id: 's', browser: { type: 'playwright', name: 'Chromium', getPage: () => page } };
    await assert.rejects(
      run({ command: 'get-a11y-tree', payload: { id: '7' }, session }),
      /Cannot find the element for accessibility tree request 7\./,
    );
    assert.equal(detached, 1);
  });

  it('returns the converted tree from the CDP responses', async () => {
    const calls: string[] = [];
    const cdp = {
      send: async (method: string) => {
        calls.push(method);
        if (method === 'Runtime.evaluate') return { result: { objectId: 'o1' } };
        if (method === 'DOM.describeNode') return { node: { backendNodeId: 101 } };
        return {
          nodes: [
            {
              nodeId: '1',
              ignored: false,
              role: { type: 'role', value: 'button' },
              name: { type: 'computedString', value: 'B' },
              backendDOMNodeId: 101,
            },
          ],
        };
      },
      detach: async () => {},
    };
    const page = { context: () => ({ newCDPSession: async () => cdp }) };
    const session = { id: 's', browser: { type: 'playwright', name: 'Chromium', getPage: () => page } };
    assert.deepEqual(await run({ command: 'get-a11y-tree', payload: { id: '1' }, session }), [
      { role: 'button', name: 'B', states: {}, relations: {}, children: [] },
    ]);
    assert.deepEqual(calls, ['Runtime.evaluate', 'DOM.describeNode', 'Accessibility.getFullAXTree']);
  });
});
