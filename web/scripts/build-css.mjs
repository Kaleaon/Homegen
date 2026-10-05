import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

function resolveTokensPath() {
  const candidates = [
    process.env.KTHEME_TOKENS_PATH,
    '/context/Ktheme/tokens.css',
    path.resolve(webRoot, '../../Ktheme/tokens.css'),
    path.resolve(webRoot, '../Ktheme/tokens.css'),
    path.resolve(webRoot, 'css/tokens.css'),
    path.resolve(webRoot, 'tokens.css'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Ktheme tokens.css not found in candidate paths: ${candidates.join(', ')}`);
}

// Token mapping tables
const LEGACY_VAR_MAP = {
  '--bg': 'var(--ktheme-bg)',
  '--panel': 'var(--ktheme-bg-surface)',
  '--ink': 'var(--ktheme-text)',
  '--muted': 'var(--ktheme-text-muted)',
  '--line': 'var(--ktheme-border)',
  '--accent': 'var(--ktheme-accent)',
  '--accent-ink': 'var(--ktheme-on-primary)',
  '--err': 'var(--ktheme-critical)',
  '--warn': 'var(--ktheme-warning)',
  '--warn-ink': 'var(--ktheme-on-secondary)',
  '--ok': 'var(--ktheme-success)',
};

const COLOR_HEX_MAP = {
  '#f1eee7': 'var(--ktheme-bg)',
  '#fffdf9': 'var(--ktheme-bg-surface)',
  '#2b2824': 'var(--ktheme-text)',
  '#5f5950': 'var(--ktheme-text-muted)',
  '#ded8cb': 'var(--ktheme-border)',
  '#2f6f5e': 'var(--ktheme-accent)',
  '#ffffff': 'var(--ktheme-on-primary)',
  '#fff': 'var(--ktheme-on-primary)',
  '#000000': 'var(--ktheme-on-secondary)',
  '#000': 'var(--ktheme-on-secondary)',
  '#c43b3b': 'var(--ktheme-critical)',
  '#b7791f': 'var(--ktheme-warning)',
  '#181102': 'var(--ktheme-on-secondary)',
  '#2f8f5b': 'var(--ktheme-success)',
  '#1d1c1a': 'var(--ktheme-bg)',
  '#262523': 'var(--ktheme-bg-surface)',
  '#ece8df': 'var(--ktheme-text)',
  '#a09a8e': 'var(--ktheme-text-muted)',
  '#3a3834': 'var(--ktheme-border)',
  '#4aa58c': 'var(--ktheme-accent-hover)',
  '#0d1b17': 'var(--ktheme-on-primary)',
  '#ef6b6b': 'var(--ktheme-critical)',
  '#e0a84c': 'var(--ktheme-warning)',
  '#120c00': 'var(--ktheme-on-secondary)',
  '#5cc78d': 'var(--ktheme-success)',
  '#2a7fff': 'var(--ktheme-info)',
  '#38bdf8': 'var(--ktheme-info)',
  '#0f172a': 'var(--ktheme-on-secondary)',
  '#7dd3fc': 'var(--ktheme-accent)',
  '#e2e8f0': 'var(--ktheme-on-primary-container)',
  '#222': 'var(--ktheme-bg-elevated)',
  '#222222': 'var(--ktheme-bg-elevated)',
};

const RADIUS_MAP = {
  '4px': 'var(--radius-xs)',
  '6px': 'var(--radius-sm)',
  '8px': 'var(--radius-md)',
  '12px': 'var(--radius-lg)',
  '16px': 'var(--radius-xl)',
  '24px': 'var(--radius-2xl)',
  '99px': 'var(--radius-full)',
  '999px': 'var(--radius-full)',
  '9999px': 'var(--radius-full)',
};

const SPACE_MAP = {
  '4px': 'var(--space-1)',
  '8px': 'var(--space-2)',
  '12px': 'var(--space-3)',
  '16px': 'var(--space-4)',
  '20px': 'var(--space-5)',
  '24px': 'var(--space-6)',
  '32px': 'var(--space-8)',
  '40px': 'var(--space-10)',
  '48px': 'var(--space-12)',
};

const FONT_SIZE_MAP = {
  '11px': 'var(--font-size-xs)',
  '12px': 'var(--font-size-sm)',
  '14px': 'var(--font-size-md)',
  '16px': 'var(--font-size-lg)',
  '20px': 'var(--font-size-xl)',
  '24px': 'var(--font-size-2xl)',
  '32px': 'var(--font-size-3xl)',
};

function tokenTransformerPlugin() {
  return {
    postcssPlugin: 'postcss-ktheme-token-transformer',
    Declaration(decl) {
      let value = decl.value;

      // 1. Replace legacy var(--bg), var(--panel), etc. references
      for (const [legacyVar, tokenVar] of Object.entries(LEGACY_VAR_MAP)) {
        const regex = new RegExp(`var\\(${legacyVar}\\)`, 'g');
        value = value.replace(regex, tokenVar);
      }

      // 2. Replace hardcoded radii
      if (decl.prop.includes('border-radius')) {
        for (const [px, token] of Object.entries(RADIUS_MAP)) {
          if (value === px) {
            value = token;
          }
        }
      }

      // 3. Replace hardcoded font sizes
      if (decl.prop === 'font-size') {
        for (const [px, token] of Object.entries(FONT_SIZE_MAP)) {
          if (value === px) {
            value = token;
          }
        }
      }

      // 4. Replace hardcoded gap
      if (decl.prop === 'gap') {
        for (const [px, token] of Object.entries(SPACE_MAP)) {
          if (value === px) {
            value = token;
          }
        }
      }

      // 5. Replace font-family strings
      if (decl.prop === 'font-family') {
        if (value.includes('system-ui') && !value.includes('var(')) {
          value = 'var(--font-family-sans)';
        }
      }

      // 6. Replace orphan hex colors where appropriate
      if (!decl.parent || decl.parent.selector !== ':root') {
        for (const [hex, token] of Object.entries(COLOR_HEX_MAP)) {
          if (value.toLowerCase() === hex.toLowerCase()) {
            value = token;
          }
        }
      }

      decl.value = value;
    },
  };
}
tokenTransformerPlugin.postcss = true;

async function build() {
  console.log('🔨 Compiling Ktheme tokens and application stylesheets...');

  const tokensPath = resolveTokensPath();
  console.log(`📖 Loading design tokens from: ${tokensPath}`);
  const tokensContent = fs.readFileSync(tokensPath, 'utf8');

  const srcCssPath = path.resolve(webRoot, 'css/src/style.css');
  const sourceCssPath = fs.existsSync(srcCssPath)
    ? srcCssPath
    : path.resolve(webRoot, 'css/style.css');

  console.log(`📄 Processing source stylesheet: ${sourceCssPath}`);
  const sourceCss = fs.readFileSync(sourceCssPath, 'utf8');

  // Process with PostCSS
  const result = await postcss([tokenTransformerPlugin()]).process(sourceCss, {
    from: sourceCssPath,
  });

  // Combine tokens CSS and transformed application CSS
  const compiledOutput = `${tokensContent}\n\n/* Application Stylesheet (Compiled) */\n${result.css}`;

  const distCssPath = path.resolve(webRoot, 'dist/css/style.css');
  const appCssPath = path.resolve(webRoot, 'css/style.css');

  fs.mkdirSync(path.dirname(distCssPath), { recursive: true });
  fs.writeFileSync(distCssPath, compiledOutput, 'utf8');
  fs.writeFileSync(appCssPath, compiledOutput, 'utf8');

  console.log(`✅ CSS compiled successfully!`);
  console.log(`  - Output: ${distCssPath}`);
  console.log(`  - Output: ${appCssPath}`);
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
