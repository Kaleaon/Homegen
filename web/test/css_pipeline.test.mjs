import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');
const distCssPath = path.join(webDir, 'dist/css/style.css');
const appCssPath = path.join(webDir, 'css/style.css');

test('Build Pipeline: npm run build compiles tokens.css into distribution CSS', () => {
  // Execute build script
  execSync('npm run build', { cwd: webDir, stdio: 'pipe' });

  assert.ok(fs.existsSync(distCssPath), 'dist/css/style.css must exist after build');
  assert.ok(fs.existsSync(appCssPath), 'css/style.css must exist after build');

  const compiledCss = fs.readFileSync(distCssPath, 'utf8');

  // Verify Ktheme custom properties exist in compiled CSS
  assert.ok(compiledCss.includes('--ktheme-bg:'), 'Compiled CSS defines --ktheme-bg');
  assert.ok(compiledCss.includes('--ktheme-accent:'), 'Compiled CSS defines --ktheme-accent');
  assert.ok(compiledCss.includes('--font-family-sans:'), 'Compiled CSS defines --font-family-sans');
  assert.ok(compiledCss.includes('--space-2:'), 'Compiled CSS defines --space-2');
  assert.ok(compiledCss.includes('--radius-sm:'), 'Compiled CSS defines --radius-sm');
});

test('Token Transformation: Replaces legacy variables with Ktheme token references', () => {
  const compiledCss = fs.readFileSync(distCssPath, 'utf8');

  // Verify application declarations use Ktheme token variables
  assert.ok(compiledCss.includes('var(--ktheme-bg)'), 'CSS uses var(--ktheme-bg)');
  assert.ok(compiledCss.includes('var(--ktheme-accent)'), 'CSS uses var(--ktheme-accent)');
  assert.ok(compiledCss.includes('var(--ktheme-text)'), 'CSS uses var(--ktheme-text)');
  assert.ok(compiledCss.includes('var(--ktheme-border)'), 'CSS uses var(--ktheme-border)');
  assert.ok(compiledCss.includes('var(--radius-sm)'), 'CSS uses var(--radius-sm)');
});

test('CSS Linter: npm run lint:css passes on token-compliant CSS', () => {
  const stdout = execSync('npm run lint:css', { cwd: webDir, encoding: 'utf8' });
  assert.ok(
    stdout.includes('All CSS rules comply with Ktheme design tokens!'),
    'Linter reports compliance'
  );
});

test('CSS Linter: npm run lint:css fails and suggests tokens on non-compliant CSS', () => {
  const tempCssPath = path.join(webDir, 'css/src/temp_non_compliant.css');
  fs.writeFileSync(
    tempCssPath,
    'button { border-radius: 19px; color: #e91e63; font-family: Arial; }',
    'utf8'
  );

  let failed = false;
  let output = '';
  try {
    execSync(`node scripts/lint-css.mjs ${tempCssPath}`, {
      cwd: webDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err) {
    failed = true;
    output = err.stderr || err.stdout;
  } finally {
    if (fs.existsSync(tempCssPath)) {
      fs.unlinkSync(tempCssPath);
    }
  }

  assert.ok(failed, 'Linter must fail on non-compliant CSS');
  assert.ok(
    output.includes('Hardcoded pixel border-radius'),
    'Linter flags hardcoded border radius'
  );
  assert.ok(output.includes('Hardcoded hex color'), 'Linter flags hardcoded hex color');
  assert.ok(output.includes('Non-standard font-family'), 'Linter flags non-standard font family');
  assert.ok(output.includes('Suggestion:'), 'Linter outputs token suggestions');
});

test('Serve MJS: Serves compiled distribution stylesheet cleanly', async () => {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { extname, join, normalize } = await import('node:path');

  const root = webDir;
  const types = { '.css': 'text/css' };

  const server = createServer(async (req, res) => {
    const reqPath = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^(\.\.[/\\])+/,
      ''
    );
    const file = join(root, reqPath);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });

  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;

  try {
    const resp = await fetch(`http://localhost:${port}/dist/css/style.css`);
    assert.equal(resp.status, 200, 'HTTP status is 200 OK');
    assert.equal(resp.headers.get('content-type'), 'text/css', 'Content-Type is text/css');
    const body = await resp.text();
    assert.ok(body.includes('--ktheme-bg'), 'Response body contains compiled CSS tokens');
  } finally {
    server.close();
  }
});

test('Build Pipeline: resolves web/css/tokens.css when KTHEME_TOKENS_PATH is unassigned', () => {
  const stdout = execSync('node scripts/build-css.mjs', {
    cwd: webDir,
    encoding: 'utf8',
    env: { ...process.env, KTHEME_TOKENS_PATH: '' },
  });
  assert.ok(
    stdout.includes('CSS compiled successfully!'),
    'build-css compiles successfully standalone'
  );
});
