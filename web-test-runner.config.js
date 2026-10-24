import { playwrightLauncher } from '@web/test-runner-playwright';
import { a11yTreePlugin } from './dist/index.js';

export default {
  nodeResolve: true,
  files: ['test/browser/**/*.test.js'],
  browsers: [playwrightLauncher({ product: 'chromium' })],
  plugins: [a11yTreePlugin()],
};
