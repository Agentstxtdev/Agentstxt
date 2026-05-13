import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    prerenderEnvironment: 'node',
    platformProxy: { enabled: true },
    imagesBindingName: false,
  }),
  markdown: {
    syntaxHighlight: false,
  },
});
