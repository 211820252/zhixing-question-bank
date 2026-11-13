import { readFile, readlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = resolve(dirname(scriptPath), '..');
const outputLimit = 64 * 1024 * 1024;
const concurrency = 5;

// Credentials remain inside gh; never read, print, or interpolate its token.
async function command(name, args, input, cwd) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(name, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    let stdoutBytes = 0, stderrBytes = 0, limitExceeded = false;
    const collect = (chunks, stream) => chunk => {
      if (stream === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes > outputLimit || stderrBytes > outputLimit) {
        limitExceeded = true;
        child.kill();
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    child.on('error', reject);
    // A rejected API request may close stdin before a large payload finishes.
    // Its exit status and stderr below provide the useful diagnostic.
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.on('close', code => {
      if (limitExceeded) return reject(Error(`${name} output exceeded ${outputLimit / 1024 / 1024} MiB`));
      if (code !== 0) return reject(Error(Buffer.concat(stderr).toString('utf8').trim() || `${name} failed (exit ${code})`));
      resolveCommand(Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end(input);
  });
}

export function gitBlobSha(content) {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  }));
  return results;
}

export async function publish(repository, { root = workspaceRoot, runCommand = command, log = console.log } = {}) {
  if (!repository || !/^[\w-]+\/[\w.-]+$/.test(repository)) {
    throw Error('Usage: node scripts/publish-github-api.mjs owner/repository');
  }
  root = resolve(root);
  const run = (name, args, input) => runCommand(name, args, input, root);
  async function api(endpoint, payload, method = 'POST') {
    const args = ['api', '-X', method, `repos/${repository}/${endpoint}`];
    if (payload !== undefined) args.push('--input', '-');
    return JSON.parse(await run('gh', args, payload === undefined ? undefined : JSON.stringify(payload)));
  }

  let baseCommit;
  try {
    baseCommit = (await api('git/ref/heads/main', undefined, 'GET')).object.sha;
  } catch (error) {
    if (!String(error).includes('HTTP 404') && !String(error).includes('HTTP 409')) throw error;
    const initial = await api('contents/README.md', {
      message: 'Initialize site',
      content: (await readFile(resolve(root, 'README.md'))).toString('base64'),
      branch: 'main',
    }, 'PUT');
    baseCommit = initial.commit.sha;
  }
  const baseTree = (await api(`git/commits/${baseCommit}`, undefined, 'GET')).tree.sha;
  const remote = await api(`git/trees/${baseTree}?recursive=1`, undefined, 'GET');
  if (remote.truncated) throw Error('Remote tree listing is truncated; refusing an incomplete publish comparison');
  const remoteFiles = new Map(remote.tree.map(entry => [entry.path, entry]));
  // Read the index for paths/modes, but hash working files so uncommitted edits
  // retain the original publisher's behavior. Preserve executable/symlink modes.
  const tracked = (await run('git', ['ls-files', '--stage', '-z'])).split('\0').filter(Boolean).map(entry => {
    const match = /^(\d+) ([a-f\d]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== '0') throw Error('Resolve index conflicts before publishing');
    return { path: match[4], mode: match[1], type: match[1] === '160000' ? 'commit' : 'blob', indexSha: match[2] };
  });
  const contentFor = file => file.mode === '120000'
    ? readlink(resolve(root, file.path), { encoding: 'buffer' })
    : readFile(resolve(root, file.path));
  const compared = await mapLimited(tracked, concurrency, async file => {
    const sha = file.type === 'commit' ? file.indexSha : gitBlobSha(await contentFor(file));
    const old = remoteFiles.get(file.path);
    return old && old.sha === sha && old.mode === file.mode && old.type === file.type ? null : { ...file, sha };
  });
  const changed = compared.filter(Boolean);
  if (!changed.length) {
    log(`No changed files; main remains ${baseCommit}. Remote-only files preserved.`);
    return { changed: 0, commit: baseCommit };
  }
  log(`Publishing ${changed.length} changed file(s); ${tracked.length - changed.length} unchanged. Remote-only files preserved.`);
  const tree = await mapLimited(changed, concurrency, async file => {
    const old = remoteFiles.get(file.path);
    let sha = file.sha;
    // A mode-only change can reuse its existing Git object without uploading.
    if (file.type === 'blob' && old?.sha !== sha) {
      const content = await contentFor(file);
      if (gitBlobSha(content) !== sha) throw Error(`File changed during publish: ${file.path}; retry with a stable working tree`);
      sha = (await api('git/blobs', { content: content.toString('base64'), encoding: 'base64' })).sha;
      if (sha !== file.sha) throw Error(`GitHub blob hash mismatch for ${file.path}`);
      log(`Uploaded ${file.path}`);
    }
    return { path: file.path, mode: file.mode, type: file.type, sha };
  });
  // base_tree retains every remote entry omitted from this sparse update.
  const remoteTree = await api('git/trees', { base_tree: baseTree, tree });
  const [authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, message] =
    (await run('git', ['log', '-1', '--format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%s'])).trimEnd().split('\n');
  const remoteCommit = await api('git/commits', {
    message,
    tree: remoteTree.sha,
    parents: [baseCommit],
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: { name: committerName, email: committerEmail, date: committerDate },
  });
  // A concurrent main update must fail rather than overwrite someone else's work.
  await api('git/refs/heads/main', { sha: remoteCommit.sha, force: false }, 'PATCH');
  log(`Published ${remoteCommit.sha}`);
  log(`Local commit ${(await run('git', ['rev-parse', 'HEAD'])).trim()}`);
  return { changed: changed.length, commit: remoteCommit.sha };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  publish(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
