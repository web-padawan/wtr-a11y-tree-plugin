import * as chai from 'chai';
import { getA11yTree } from '../../dist/browser.js';
import { chaiA11yTree } from '../../dist/chai.js';
import { serializeA11yTree } from '../../dist/format.js';

chai.use(chaiA11yTree);
const { expect } = chai;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('a11y tree', () => {
  let wrapper;

  const fixture = async (html) => {
    wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    await nextFrame();
    return wrapper;
  };

  afterEach(() => {
    wrapper?.remove();
  });

  describe('combobox', () => {
    beforeEach(async () => {
      await fixture(`
        <div>
          <div id="label">Size</div>
          <div
            role="combobox"
            tabindex="0"
            aria-labelledby="label"
            aria-controls="list"
            aria-expanded="true"
            aria-activedescendant="medium"
          >Medium</div>
          <div role="listbox" id="list" aria-labelledby="label">
            <div role="option" id="small" aria-selected="false">Small</div>
            <div role="option" id="medium" aria-selected="true">Medium</div>
          </div>
        </div>
      `);
    });

    it('should serialize the tree exactly as the saved snapshot', async () => {
      expect(serializeA11yTree(await getA11yTree(wrapper))).to.equal(
        [
          '- text: Size',
          '- combobox "Size" [haspopup=listbox, expanded]:',
          '  - /value: Medium',
          '  - /activedescendant: option "Medium"',
          '  - /controls: listbox "Size"',
          '- listbox "Size" [orientation=vertical]:',
          '  - option "Small"',
          '  - option "Medium" [selected]',
        ].join('\n'),
      );
    });

    it('should match the CDP accessibility tree', async () => {
      await expect(wrapper).to.matchA11yTree(`
        - combobox "Size" [expanded]:
          - /value: Medium
          - /activedescendant: option "Medium"
          - /controls: listbox "Size"
        - listbox "Size":
          - option "Medium" [selected]
      `);
    });

    it('should equal the saved accessibility tree snapshot', async () => {
      await expect(wrapper).to.equalA11yTreeSnapshot();
    });

    it('should reject a mismatch with the serialized tree as actual', async () => {
      let error;
      try {
        await expect(wrapper).to.matchA11yTree('- combobox "Other"');
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(chai.AssertionError);
      expect(error.actual).to.equal(serializeA11yTree(await getA11yTree(wrapper)));
      expect(error.expected).to.equal('- combobox "Other"');
    });
  });

  it('should include elements inside an open shadow root', async () => {
    await fixture('<div id="host"></div>');
    const root = wrapper.firstElementChild.attachShadow({ mode: 'open' });
    root.innerHTML = '<button aria-pressed="true">Toggle</button>';
    await nextFrame();
    const [button] = await getA11yTree(wrapper);
    expect(button).to.deep.include({ role: 'button', name: 'Toggle' });
    expect(button.states).to.include({ pressed: 'true' });
  });

  it('should return an empty tree for a hidden element', async () => {
    await fixture('<button aria-hidden="true">Hidden</button>');
    expect(await getA11yTree(wrapper.firstElementChild)).to.deep.equal([]);
  });
});
