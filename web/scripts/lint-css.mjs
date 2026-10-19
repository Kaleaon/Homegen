import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const PX_RADIUS_REGEX = /^\d+px$/;
const UNAPPROVED_FONT_REGEX =
  /\b(Arial|Helvetica|Times New Roman|Courier New|Verdana|Georgia|Tahoma|Comic Sans MS)\b/i;

function lintCssPlugin(options = {}) {
  const errors = [];

  return {
    postcssPlugin: 'postcss-ktheme-token-linter',
    Declaration(decl) {
      // Ignore token definitions inside :root
      if (decl.parent && decl.parent.selector === ':root') {
        return;
      }

      const selector = decl.parent && decl.parent.selector ? decl.parent.selector : 'global';
      const line = decl.source && decl.source.start ? decl.source.start.line : '?';
      const value = decl.value;

      // 1. Check for hardcoded hex colors
      const hexMatches = value.match(HEX_COLOR_REGEX);
      if (hexMatches) {
        // Exception: allowed inside SVGs or specific low-level data URIs if any, but flag in raw CSS
        for (const hex of hexMatches) {
          errors.push({
            line,
            selector,
            prop: decl.prop,
            value,
            message: `Hardcoded hex color '${hex}' found.`,
            suggestion: `Use a Ktheme color token (e.g. var(--ktheme-accent), var(--ktheme-bg), var(--ktheme-text), var(--ktheme-critical)).`,
          });
        }
      }

      // 2. Check for hardcoded border-radius
      if (decl.prop.includes('border-radius')) {
        const parts = value.split(/\s+/);
        for (const part of parts) {
          if (PX_RADIUS_REGEX.test(part) && part !== '0' && part !== '0px') {
            errors.push({
              line,
              selector,
              prop: decl.prop,
              value,
              message: `Hardcoded pixel border-radius '${part}' found.`,
              suggestion: `Use a Ktheme radius token: var(--radius-xs) (4px), var(--radius-sm) (6px), var(--radius-md) (8px), var(--radius-lg) (12px), var(--radius-xl) (16px), or var(--radius-full).`,
            });
          }
        }
      }

      // 3. Check for unapproved font families
      if (decl.prop === 'font-family') {
        if (
          UNAPPROVED_FONT_REGEX.test(value) ||
          (!value.includes('var(--font-family') && !value.includes('inherit'))
        ) {
          errors.push({
            line,
            selector,
            prop: decl.prop,
            value,
            message: `Non-standard font-family '${value}' found.`,
            suggestion: `Use var(--font-family-sans) or var(--font-family-mono).`,
          });
        }
      }
    },
    OnceExit() {
      options.onComplete(errors);
    },
  };
}
lintCssPlugin.postcss = true;

async function runLinter() {
  const args = process.argv.slice(2);
  let targetFiles;

  if (args.length > 0) {
    targetFiles = args.map((arg) => path.resolve(process.cwd(), arg));
  } else {
    const defaultFile = fs.existsSync(path.resolve(webRoot, 'css/src/style.css'))
      ? path.resolve(webRoot, 'css/src/style.css')
      : path.resolve(webRoot, 'css/style.css');
    targetFiles = [defaultFile];
  }

  let totalLintErrors = [];

  for (const targetFile of targetFiles) {
    console.log(`🔍 Running Ktheme CSS Token Linter on: ${targetFile}`);

    if (!fs.existsSync(targetFile)) {
      console.error(`❌ Target CSS file not found: ${targetFile}`);
      process.exit(1);
    }

    const cssContent = fs.readFileSync(targetFile, 'utf8');
    let lintErrors = [];

    await postcss([
      lintCssPlugin({
        onComplete: (errors) => {
          lintErrors = errors;
        },
      }),
    ]).process(cssContent, { from: targetFile });

    if (lintErrors.length > 0) {
      totalLintErrors.push(
        ...lintErrors.map((err) => ({
          ...err,
          file: targetFile,
        }))
      );
    }
  }

  if (totalLintErrors.length > 0) {
    console.error(
      `\n❌ Token Compliance Linting Failed with ${totalLintErrors.length} error(s):\n`
    );
    for (const err of totalLintErrors) {
      console.error(`  [${err.file}:${err.line}] ${err.selector} { ${err.prop}: ${err.value} }`);
      console.error(`    ↳ Error: ${err.message}`);
      console.error(`    ↳ Suggestion: ${err.suggestion}\n`);
    }
    process.exit(1);
  } else {
    console.log(`\n✔ All CSS rules comply with Ktheme design tokens!`);
    process.exit(0);
  }
}

runLinter().catch((err) => {
  console.error('❌ Linter encountered an unexpected error:', err);
  process.exit(1);
});
