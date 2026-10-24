/**
 * Copied from vaadin/web-components test/plugins/index.js and index.d.ts
 * on proto/aria-snapshot at a9833531f6.
 */
/// <reference types="chai" preserve="true" />
import { getSnapshot, getSnapshotConfig, saveSnapshot } from '@web/test-runner-commands';
import { getA11yTree } from './browser.ts';
import {
  dedent,
  matchDisplayList,
  parseDisplayTree,
  serializeA11yTree,
  serializeDisplayTree,
  toDisplayTree,
} from './format.ts';

declare global {
  namespace Chai {
    interface Assertion {
      /**
       * Compares the Chromium accessibility tree of an element with the one saved for the current test.
       */
      equalA11yTreeSnapshot(): Promise<void>;

      /**
       * Checks that the Chromium accessibility tree of an element contains the nodes of the expected tree.
       */
      matchA11yTree(expected: string): Promise<void>;
    }
  }
}

/**
 * Adds `matchA11yTree(expected)`, which checks that the Chromium accessibility
 * tree of an element contains the nodes of the expected tree. The expected tree
 * uses the snapshot format and lists only what the test cares about.
 */
const chaiA11yTreeMatch: Chai.ChaiPlugin = (chai, utils) => {
  async function matchA11yTree(this: Chai.AssertionStatic, expected: string) {
    const element = utils.flag(this, 'object');
    const actual = toDisplayTree(await getA11yTree(element));
    if (!matchDisplayList(parseDisplayTree(expected), actual, true)) {
      throw new chai.AssertionError(
        'expected accessibility tree to contain the expected nodes',
        { actual: serializeDisplayTree(actual), expected: dedent(expected), showDiff: true },
        utils.flag(this, 'ssfi'),
      );
    }
  }

  utils.addMethod(chai.Assertion.prototype, 'matchA11yTree', matchA11yTree);
};

/**
 * Adds `equalA11yTreeSnapshot()`, which compares the Chromium accessibility
 * tree of an element with the one saved for the current test, and saves it
 * when there is none or when the test runner is called with `--update-snapshots`.
 */
const chaiA11yTreeSnapshot: Chai.ChaiPlugin = (chai, utils) => {
  async function equalA11yTreeSnapshot(this: Chai.AssertionStatic) {
    const runner = (globalThis as { __WTR_MOCHA_RUNNER__?: Mocha.Runner & { test: Mocha.Test } }).__WTR_MOCHA_RUNNER__;
    if (!runner) {
      throw new Error('equalA11yTreeSnapshot() works only in Mocha tests run by Web Test Runner.');
    }
    const element = utils.flag(this, 'object');
    const name = runner.test.titlePath().join(' ');
    const snapshot = serializeA11yTree(await getA11yTree(element));
    const currentSnapshot = await getSnapshot({ name });
    const config = await getSnapshotConfig();

    if (currentSnapshot && !config.updateSnapshots) {
      if (currentSnapshot !== snapshot) {
        throw new chai.AssertionError(
          `Accessibility tree snapshot ${name} does not match the saved snapshot on disk`,
          { actual: snapshot, expected: currentSnapshot, showDiff: true },
          utils.flag(this, 'ssfi'),
        );
      }
    } else if (currentSnapshot !== snapshot) {
      await saveSnapshot({ name, content: snapshot });
    }
  }

  utils.addMethod(chai.Assertion.prototype, 'equalA11yTreeSnapshot', equalA11yTreeSnapshot);
};

/**
 * Registers `matchA11yTree()` and `equalA11yTreeSnapshot()`. It does not
 * import chai: `chai.use()` passes the instance of the consumer.
 *
 * @example
 * import * as chai from 'chai';
 * import { chaiA11yTree } from 'wtr-a11y-tree-plugin/chai';
 *
 * chai.use(chaiA11yTree);
 */
export const chaiA11yTree: Chai.ChaiPlugin = (chai, utils) => {
  chaiA11yTreeMatch(chai, utils);
  chaiA11yTreeSnapshot(chai, utils);
};
