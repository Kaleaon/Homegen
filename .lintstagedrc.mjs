export default {
  'web/**/*.{js,mjs}': 'npx --prefix web eslint',
  'web/**/*.{js,mjs,json,css,html}': 'npx --prefix web prettier --check --ignore-path web/.prettierignore',
  'web/css/**/*.css': 'node web/scripts/lint-css.mjs',
  'designer3d/tools/**/*.{js,mjs}': 'npx --prefix designer3d/tools eslint',
  'designer3d/tools/**/*.{js,mjs,json}': 'npx --prefix designer3d/tools prettier --check --ignore-path designer3d/tools/.prettierignore',
  'app/**/*.{kt,kts}': () => './gradlew :app:spotlessCheck',
  '*.gradle.kts': () => './gradlew :app:spotlessCheck',
};
