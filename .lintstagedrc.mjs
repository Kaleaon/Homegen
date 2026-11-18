import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const quoteArg = (arg) => (arg.includes("'") ? `"${arg}"` : `'${arg}'`);

const toSubprojectFiles = (subprojectDir, filenames) =>
  filenames.map((file) => {
    const baseDir =
      path.isAbsolute(file) && !file.startsWith(`${rootDir}${path.sep}`) ? process.cwd() : rootDir;
    const relativeFile = path
      .relative(path.resolve(baseDir, subprojectDir), path.resolve(baseDir, file))
      .split(path.sep)
      .join('/');
    return quoteArg(relativeFile);
  });

const runInSubproject = (subprojectDir, command) => (filenames) => {
  if (filenames.length === 0) {
    return [];
  }
  const files = toSubprojectFiles(subprojectDir, filenames).join(' ');
  return `sh -c 'cd "$1" && shift && exec npx "$@"' sh ${quoteArg(subprojectDir)} ${command} ${files}`;
};

export default {
  '**/*.{js,mjs}': (filenames) =>
    filenames
      .filter((file) => !file.includes('/vendor/') && !file.includes('\\vendor\\'))
      .map((file) => `node --check ${JSON.stringify(file)}`),
  'web/**/*.{js,mjs}': runInSubproject('web', 'eslint'),
  'web/**/*.{js,mjs,json,css,html}': runInSubproject(
    'web',
    'prettier --check --ignore-path .prettierignore'
  ),
  'web/css/**/*.css': 'node web/scripts/lint-css.mjs',
  'designer3d/tools/**/*.{js,mjs}': runInSubproject('designer3d/tools', 'eslint'),
  'designer3d/tools/**/*.{js,mjs,json}': runInSubproject(
    'designer3d/tools',
    'prettier --check --ignore-path .prettierignore'
  ),
  'app/**/*.{kt,kts}': () => './gradlew :app:spotlessCheck',
  '*.gradle.kts': () => './gradlew :app:spotlessCheck',
};
