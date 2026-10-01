import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const appScript = join(here, '..', 'app', 'scripts', 'data-type-in-contract.ts');
const extensionScript = join(here, '..', 'extension', 'scripts', 'data-type-in-contract.ts');
const workDirs: string[] = [];

after(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

function readTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(root, path).split(sep).join('/')] = readFileSync(path, 'utf8');
  }
  return files;
}

interface Run {
  readonly root: string;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function copyFixture(name: string, side: 'before' | 'after'): string {
  const root = mkdtempSync(join(tmpdir(), `data-type-in-contract-${name}-`));
  workDirs.push(root);
  cpSync(join(fixtures, name, side), root, { recursive: true });
  return root;
}

function runScript(root: string, script = appScript): Run {
  const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  return { root, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function upgrade(name: string, side: 'before' | 'after' = 'before', script = appScript): Run {
  return runScript(copyFixture(name, side), script);
}

function expectedTree(name: string, side: 'before' | 'after'): Record<string, string> {
  return readTree(join(fixtures, name, side));
}

describe('a Postgres project with an extension space and three snapshots', () => {
  const run = upgrade('postgres-extension-space');
  const tree = readTree(run.root);
  const expected = expectedTree('postgres-extension-space', 'after');

  it('exits 0 without output', () => {
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr },
      {
        status: 0,
        stdout: '',
        stderr: '',
      },
    );
  });

  it('rewrites the emitted contract and its declarations in the emitter form', () => {
    assert.deepEqual(
      [tree['prisma/contract.json'], tree['prisma/contract.d.ts']],
      [expected['prisma/contract.json'], expected['prisma/contract.d.ts']],
    );
  });

  it('renames every snapshot directory to its new storage hash and rewrites its files', () => {
    const snapshots = (files: Record<string, string>) =>
      Object.entries(files).filter(([path]) => path.startsWith('migrations/snapshots/'));
    assert.deepEqual(snapshots(tree), snapshots(expected));
  });

  it('rewrites from, to and migrationHash of every migration, refs and migration.ts imports', () => {
    const migrations = (files: Record<string, string>) =>
      Object.entries(files).filter(
        ([path]) => path.startsWith('migrations/') && !path.startsWith('migrations/snapshots/'),
      );
    assert.deepEqual(migrations(tree), migrations(expected));
  });

  it('leaves a contract of another family unchanged', () => {
    assert.equal(tree['mongo/contract.json'], expected['mongo/contract.json']);
  });

  it('produces exactly the expected tree', () => {
    assert.deepEqual(tree, expected);
  });
});

describe('a SQLite project with literal defaults', () => {
  it('maps every SQLite codec and rewrites JSON and integer defaults', () => {
    const run = upgrade('sqlite-defaults');
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      { status: 0, stdout: '', stderr: '', tree: expectedTree('sqlite-defaults', 'after') },
    );
  });
});

describe('an extension package', () => {
  it('rewrites the contract space with the extension copy of the script', () => {
    const run = upgrade('extension-package', 'before', extensionScript);
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      { status: 0, stdout: '', stderr: '', tree: expectedTree('extension-package', 'after') },
    );
  });

  it('ships the same script to both audiences', () => {
    assert.equal(readFileSync(extensionScript, 'utf8'), readFileSync(appScript, 'utf8'));
  });
});

describe('a project already in the new format', () => {
  for (const name of ['postgres-extension-space', 'sqlite-defaults', 'extension-package']) {
    it(`leaves ${name} unchanged and exits 0`, () => {
      const run = upgrade(name, 'after');
      assert.deepEqual(
        { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
        { status: 0, stdout: '', stderr: '', tree: expectedTree(name, 'after') },
      );
    });
  }

  it('is unchanged by a second run', () => {
    const first = upgrade('postgres-extension-space');
    const second = runScript(first.root);
    assert.deepEqual(
      { status: second.status, stdout: second.stdout, tree: readTree(second.root) },
      { status: 0, stdout: '', tree: expectedTree('postgres-extension-space', 'after') },
    );
  });
});

describe('a codec the script does not know', () => {
  it('names each file and codec, changes no file and exits 1', () => {
    const run = upgrade('unknown-codec');
    const snapshot = Object.keys(expectedTree('unknown-codec', 'before')).find((path) =>
      path.endsWith('/contract.json'),
    );
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      {
        status: 1,
        stdout: '',
        stderr: [
          `${snapshot}: unknown codec acme/shape@1`,
          'prisma/contract.json: unknown codec acme/shape@1',
          '',
        ].join('\n'),
        tree: expectedTree('unknown-codec', 'before'),
      },
    );
  });
});

describe('a snapshot directory that already holds the new hash', () => {
  it('stops when its content differs, changes no file and exits 1', () => {
    const run = upgrade('snapshot-collision');
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      {
        status: 1,
        stdout: '',
        stderr:
          'migrations/snapshots/d3a277a78b83a532f1ce006d0b7b5e059cc9d15a440922acd9df1055156afbf2: snapshot directory already exists with different content\n',
        tree: expectedTree('snapshot-collision', 'before'),
      },
    );
  });

  it('removes the old directory when the content is the same', () => {
    const run = upgrade('snapshot-already-present');
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      {
        status: 0,
        stdout: '',
        stderr: '',
        tree: expectedTree('snapshot-already-present', 'after'),
      },
    );
  });
});

describe('a snapshot whose stored hash does not recompute', () => {
  it('rehashes it from content, says so and rewrites everything that names it', () => {
    const run = upgrade('stale-hash');
    assert.deepEqual(
      { status: run.status, stdout: run.stdout, stderr: run.stderr, tree: readTree(run.root) },
      {
        status: 0,
        stdout: `migrations/snapshots/${'a'.repeat(64)}/contract.json: stored hash did not recompute; rehashed from content\n`,
        stderr: '',
        tree: expectedTree('stale-hash', 'after'),
      },
    );
  });
});

describe('the project root', () => {
  it('defaults to the working directory', () => {
    const root = copyFixture('sqlite-defaults', 'before');
    const result = spawnSync(process.execPath, [appScript], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(
      { status: result.status, tree: readTree(root) },
      { status: 0, tree: expectedTree('sqlite-defaults', 'after') },
    );
  });
});
