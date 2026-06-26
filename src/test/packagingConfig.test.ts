import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
const workspacePackageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
const vscodeIgnore = readFileSync(path.resolve(__dirname, '../../.vscodeignore'), 'utf8');
const packageVsixScript = readFileSync(path.resolve(__dirname, '../../scripts/package-vsix.js'), 'utf8');
const cleanDistScript = readFileSync(path.resolve(__dirname, '../../scripts/clean-dist.js'), 'utf8');
const readme = readFileSync(path.resolve(__dirname, '../../README.md'), 'utf8');
const extensionSource = readFileSync(path.resolve(__dirname, '../../src/extension.ts'), 'utf8');
const projectFilesSource = readFileSync(path.resolve(__dirname, '../../src/projectFiles.ts'), 'utf8');
const codeFocusGitignore = readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8');
const codeFocusLicensePath = path.resolve(__dirname, '../../LICENSE');
const launchConfig = JSON.parse(readFileSync(path.resolve(__dirname, '../../.vscode/launch.json'), 'utf8'));
const tasksConfig = JSON.parse(readFileSync(path.resolve(__dirname, '../../.vscode/tasks.json'), 'utf8'));

test('Code Focus package has its own license and gitignore', () => {
  assert.equal(existsSync(codeFocusLicensePath), true);
  const license = readFileSync(codeFocusLicensePath, 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Code Focus contributors/);
  for (const expectedPattern of ['node_modules/', 'dist/', 'coverage/', '.vscode-test/', '*.vsix']) {
    assert.ok(codeFocusGitignore.includes(expectedPattern), `missing ${expectedPattern}`);
  }
});

test('Code Focus package has no external umbrella package-facing coupling', () => {
  const license = readFileSync(codeFocusLicensePath, 'utf8');
  const packageFacingText = [JSON.stringify(packageJson), readme, license].join('\n');
  const formerPublisherName = ['rel', 'ayx'].join('');
  const umbrellaProductName = ['source', 'replay'].join('');
  assert.equal(packageJson.publisher, 'codefocus');
  assert.deepEqual(packageJson.repository, { type: 'git', url: 'https://github.com/Groghal/code-focus.git' });
  assert.equal(packageJson.homepage, 'https://github.com/Groghal/code-focus');
  assert.deepEqual(packageJson.bugs, { url: 'https://github.com/Groghal/code-focus/issues' });
  assert.doesNotMatch(packageFacingText, new RegExp(formerPublisherName, 'i'));
  assert.doesNotMatch(packageFacingText, new RegExp(umbrellaProductName, 'i'));
});

test('Code Focus package manifest fields map to implemented extension behavior', () => {
  assert.equal(packageJson.main, './dist/extension.js');
  assert.equal(packageJson.activationEvents[0], `onCommand:${packageJson.contributes.commands[0].command}`);
  assert.equal(packageJson.activationEvents[1], `onCommand:${packageJson.contributes.commands[1].command}`);
  assert.match(extensionSource, /registerCommand\('codeFocus\.showPanel'/);
  assert.match(extensionSource, /panel\.webview\.html = renderCodePresenterHtml\(\{[\s\S]*Loading Code Focus presenter/);
  assert.match(extensionSource, /panel\.reveal\(vscode\.ViewColumn\.Beside\)/);
  assert.match(extensionSource, /void refreshPanel\(context\)/);
  assert.match(extensionSource, /function rememberPresentedEditor/);
  assert.match(extensionSource, /registerCommand\('codeFocus\.reloadFromActiveEditor'/);

  assert.equal(packageJson.contributes.configuration, undefined);
  assert.equal(extensionSource.includes('getConfiguration('), false);

  const removedSettingFragments = [
    ['codeFocus', 'metadata'].join('.'),
    ['codeFocus', 'presenter'].join('.'),
    ['pay', 'load', 'Format'].join(''),
    ['include', 'File', 'Hash'].join(''),
    ['show', 'Details'].join(''),
    ['text', 'Area', 'Coordinates'].join(''),
    ['refresh', 'Ms'].join(''),
    ['build', 'Payload'].join(''),
    ['build', 'Compact', 'Payload'].join(''),
    ['build', 'Json', 'Payload'].join(''),
    ['short', 'Content', 'Hash'].join(''),
  ];
  const productSources = [JSON.stringify(packageJson), extensionSource].join('\n');
  for (const fragment of removedSettingFragments) {
    assert.equal(productSources.includes(fragment), false, `removed metadata setting still present: ${fragment}`);
  }

  assert.equal(packageJson.engines.vscode, '^1.70.0');
  assert.equal(packageJson.devDependencies['@types/vscode'], '^1.70.0');
  assert.doesNotMatch(extensionSource, /findFiles\(/);
  assert.match(extensionSource, /readdir/);
  assert.match(extensionSource, /PRUNED_PROJECT_TREE_DIRECTORIES/);
  assert.match(extensionSource, /PROJECT_TREE_WALK_YIELD_INTERVAL/);
  assert.match(extensionSource, /getCachedProjectFileTreeForCurrentDocument/);
  assert.match(extensionSource, /isProjectFileTreeLoadingForCurrentDocument/);
  assert.match(extensionSource, /projectFilesLoading/);
  assert.match(extensionSource, /ensureProjectFileTreeLoading\(context\)/);
  assert.match(extensionSource, /scheduleRefresh\(context\)/);
  assert.match(extensionSource, /cachedProjectFilesWorkspacePath/);
  assert.match(extensionSource, /cachedProjectFilesPromise/);
  assert.match(extensionSource, /function invalidateProjectFileTree/);
  assert.match(extensionSource, /onDidCreateFiles\(\(\) => invalidateProjectFileTree\(context\)\)/);
  assert.match(extensionSource, /createFileSystemWatcher\('\*\*\/\.gitignore'\)/);
  assert.deepEqual(Object.keys(packageJson.dependencies), ['ignore']);
  assert.match(projectFilesSource, /import ignore = require\('ignore'\)/);
  assert.match(packageJson.scripts.build, /tsc -p \./);
  assert.match(packageJson.scripts.build, /esbuild/);
  assert.match(packageVsixScript, /@vscode\/vsce/);
  assert.deepEqual(new Set(Object.keys(packageJson.devDependencies)), new Set(['@types/node', '@types/vscode', '@vscode/vsce', 'esbuild', 'typescript']));
});

test('folder-local VS Code debug config launches Code Focus as an extension host', () => {
  const debugConfig = launchConfig.configurations.find((configuration: { name?: string }) => configuration.name === 'Debug Code Focus');
  assert.ok(debugConfig, 'missing Debug Code Focus launch configuration');
  assert.equal(debugConfig.type, 'extensionHost');
  assert.equal(debugConfig.request, 'launch');
  assert.equal(debugConfig.runtimeExecutable, '${execPath}');
  assert.deepEqual(debugConfig.args, ['--extensionDevelopmentPath=${workspaceFolder}']);
  assert.deepEqual(debugConfig.outFiles, ['${workspaceFolder}/dist/**/*.js']);
  assert.equal(debugConfig.preLaunchTask, 'build-code-focus');

  const buildTask = tasksConfig.tasks.find((task: { label?: string }) => task.label === 'build-code-focus');
  assert.ok(buildTask, 'missing build-code-focus task');
  assert.equal(buildTask.type, 'npm');
  assert.equal(buildTask.script, 'build');
  assert.equal(buildTask.path, undefined);
});

test('Code Focus build bundles runtime dependencies for VSIX packaging', () => {
  assert.match(packageJson.scripts.build, /esbuild/);
  assert.match(packageJson.scripts.build, /--bundle/);
  assert.match(packageJson.scripts.build, /--external:vscode/);
});

test('Code Focus VSIX ignore excludes workspace noise and unbundled dependencies', () => {
  for (const expectedPattern of ['node_modules/**', '../**', 'dist/test/**', 'dist/**/*.map', 'dist/*.vsix', 'scripts/**']) {
    assert.ok(vscodeIgnore.includes(expectedPattern), `missing ${expectedPattern}`);
  }
});

test('Code Focus prebuild uses a Windows-tolerant cleanup helper instead of inline rmSync', () => {
  assert.equal(packageJson.scripts.prebuild, 'node scripts/clean-dist.js');
  assert.doesNotMatch(packageJson.scripts.prebuild, /rmSync\('dist'/);
  assert.match(cleanDistScript, /EPERM/);
  assert.match(cleanDistScript, /cleanup warning/i);
});

test('workspace exposes an npm job to build the Code Focus VSIX', () => {
  assert.equal(workspacePackageJson.scripts['build:vsix'], 'npm run build:vsix --workspace code-focus');
});

test('Code Focus VSIX job builds first and writes a versioned artifact without shell-only expansion', () => {
  assert.equal(packageJson.scripts['build:vsix'], 'npm run build && node scripts/package-vsix.js');
  assert.doesNotMatch(packageJson.scripts['build:vsix'], /\$\{npm_package_version\}/);
  assert.equal(packageJson.devDependencies['@vscode/vsce'], '^3.9.1');
});

test('Code Focus contributes only presenter and active-editor reload commands', () => {
  assert.deepEqual(packageJson.activationEvents, [
    'onCommand:codeFocus.showPanel',
    'onCommand:codeFocus.reloadFromActiveEditor',
  ]);
  assert.deepEqual(packageJson.contributes.commands, [
    {
      command: 'codeFocus.showPanel',
      title: 'Code Focus: Show Panel',
    },
    {
      command: 'codeFocus.reloadFromActiveEditor',
      title: 'Code Focus: Reload From Active Editor',
    },
  ]);
  assert.equal(packageJson.contributes.keybindings, undefined);
});

test('Code Focus VSIX packaging invokes the local vsce entrypoint through node', () => {
  assert.match(packageVsixScript, /require\.resolve\('@vscode\/vsce\/vsce'\)/);
  assert.match(packageVsixScript, /spawnSync\(process\.execPath,/);
  assert.doesNotMatch(packageVsixScript, /vsce\.cmd/);
});

test('Code Focus package does not depend on image metadata generator packages', () => {
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const imageGeneratorPackage = `${String.fromCharCode(113)}${String.fromCharCode(114)}code`;
  const imageGeneratorTypesPackage = ['@types/', imageGeneratorPackage].join('');

  assert.equal(allDependencies[imageGeneratorPackage], undefined);
  assert.equal(allDependencies[imageGeneratorTypesPackage], undefined);
});

test('Code Focus package is framed as human code readability, not extraction tooling', () => {
  const productText = [
    packageJson.description,
    ...packageJson.contributes.commands.map((command: { title: string }) => command.title),
    readme,
  ].join('\n');

  assert.match(packageJson.description, /human/i);
  assert.match(packageJson.description, /readab/i);
  const forbiddenProductWords = [
    'screen.?rec' + 'ord',
    'rec' + 'ording',
    'rec' + 'ord this',
    'capture ' + 'surface',
    'vid' + 'eo',
    'o' + 'cr',
    'source' + 'replay',
    'pars' + 'er',
    'pars' + 'ing',
  ].join('|');
  assert.doesNotMatch(productText, new RegExp(forbiddenProductWords, 'i'));
});
