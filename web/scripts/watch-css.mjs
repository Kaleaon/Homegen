import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  return null;
}

const sourceFile = path.resolve(webRoot, 'css/src/style.css');
const tokensFile = resolveTokensPath();

function runBuild() {
  console.log('\n🔄 File change detected. Re-building CSS...');
  const buildProc = spawn('node', [path.resolve(__dirname, 'build-css.mjs')], {
    stdio: 'inherit',
    cwd: webRoot,
  });

  buildProc.on('close', (code) => {
    if (code === 0) {
      console.log('👀 Watching for CSS file changes...');
    } else {
      console.error(`❌ Build exited with code ${code}. Watching for fixes...`);
    }
  });
}

// Initial build
runBuild();

// Watch source file and tokens file
const watchTargets = [sourceFile];
if (tokensFile) watchTargets.push(tokensFile);

console.log(`👀 Watching for changes in:\n  - ${watchTargets.join('\n  - ')}`);

let debounceTimer = null;
for (const target of watchTargets) {
  if (fs.existsSync(target)) {
    fs.watch(target, (eventType) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runBuild();
      }, 100);
    });
  }
}
