import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const repository = process.argv[2];
if (!repository || !/^[\w-]+\/[\w.-]+$/.test(repository)) {
  throw Error('Usage: node scripts/publish-github-api.mjs owner/repository');
}

function command(name, args, input) {
  const result = spawnSync(name, args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw Error(result.stderr || `${name} failed`);
  return result.stdout.trim();
}

function api(endpoint, payload, method = 'POST') {
  const args = ['api', '-X', method, `repos/${repository}/${endpoint}`];
  if (payload) args.push('--input', '-');
  return JSON.parse(command('gh', args, payload ? JSON.stringify(payload) : undefined));
}

let baseCommit;
try {
  baseCommit = api('git/ref/heads/main', undefined, 'GET').object.sha;
} catch (error) {
  if (!String(error).includes('HTTP 404') && !String(error).includes('HTTP 409')) throw error;
  const initial = api('contents/README.md', {
    message: 'Initialize site',
    content: readFileSync('README.md').toString('base64'),
    branch: 'main',
  }, 'PUT');
  baseCommit = initial.commit.sha;
}

const files = command('git', ['ls-files', '-z']).split('\0').filter(Boolean);
const tree = files.map(path => {
  const blob = api('git/blobs', { content: readFileSync(path).toString('base64'), encoding: 'base64' });
  console.log(`Uploaded ${path}`);
  return { path, mode: '100644', type: 'blob', sha: blob.sha };
});

const remoteTree = api('git/trees', { tree });
const [authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, message] =
  command('git', ['log', '-1', '--format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%s']).split('\n');
const remoteCommit = api('git/commits', {
  message,
  tree: remoteTree.sha,
  parents: [baseCommit],
  author: { name: authorName, email: authorEmail, date: authorDate },
  committer: { name: committerName, email: committerEmail, date: committerDate },
});
api('git/refs/heads/main', { sha: remoteCommit.sha }, 'PATCH');
console.log(`Published ${remoteCommit.sha}`);
console.log(`Local commit ${command('git', ['rev-parse', 'HEAD'])}`);
