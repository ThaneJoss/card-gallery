import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { stringify } from 'yaml';
import { parseCards } from '../scripts/card-data.mjs';
import { localizePullRequest } from '../.github/scripts/localize-pr-cards.mjs';

const png = await sharp({ create: { width: 32, height: 20, channels: 3, background: '#2288cc' } }).png().toBuffer();
const context = { repo: { owner: 'owner', repo: 'cards' }, payload: { pull_request: { number: 123 } } };
const head = { sha: 'current-pr-head', ref: 'add-card', repo: { full_name: 'owner/cards' } };
const entry = { 名称: '新卡片', 银行: '测试银行', 类型: '信用卡', 图片: 'https://example.com/card.png' };

function fixture({
  source = stringify([entry]), pr = { state: 'open', head }, latest = pr,
  tree = [{ path: 'assets/cards/card-1.png', type: 'blob', mode: '100644' }]
} = {}) {
  const commits = [];
  const reads = [];
  const messages = [];
  let pullReads = 0;
  return {
    commits, reads, messages,
    args: {
      context,
      core: Object.fromEntries(['info', 'warning', 'notice'].map(level => [level, message => messages.push({ level, message })])),
      fetchImage: async () => new Response(png),
      github: {
        rest: {
          pulls: { get: async () => ({ data: pullReads++ ? latest : pr }) },
          repos: { getContent: async request => {
            reads.push(request);
            return { data: { type: 'file', encoding: 'base64', content: Buffer.from(source).toString('base64') } };
          } },
          git: { getTree: async request => {
            reads.push(request);
            return { data: { tree, truncated: false } };
          } }
        },
        graphql: async (_query, variables) => { commits.push(variables.input); }
      }
    }
  };
}

test('一个提交原子包含 YAML、图片新增和旧图删除，并限定预期的分支版本', async () => {
  const { args, commits, reads } = fixture();
  await localizePullRequest(args);
  assert.equal(commits.length, 1);
  const commit = commits[0];
  assert.deepEqual(commit.branch, { repositoryNameWithOwner: 'owner/cards', branchName: 'add-card' });
  assert.equal(commit.expectedHeadOid, head.sha);
  assert.equal(commit.message.headline, '自动本地化卡面并清理未引用图片');
  assert.deepEqual(commit.fileChanges.additions.map(file => file.path), ['cards.yaml', 'assets/cards/card-1-2.png']);
  assert.deepEqual(commit.fileChanges.deletions, [{ path: 'assets/cards/card-1.png' }]);
  const [yaml, image] = commit.fileChanges.additions;
  assert.equal(parseCards(Buffer.from(yaml.contents, 'base64').toString('utf8'))[0].image, './assets/cards/card-1-2.png');
  assert.deepEqual(Buffer.from(image.contents, 'base64'), png);
  assert.equal(reads[0].ref, head.sha);
  assert.equal(reads[1].tree_sha, head.sha);
});

test('全部已本地化且无闲置图片时不追加空提交，Fork 或已关闭 PR 不进行下载和写入', async () => {
  for (const options of [
    { source: stringify([{ ...entry, 图片: './assets/cards/card-1.png' }]) },
    { pr: { state: 'closed', head } },
    { pr: { state: 'open', head: { ...head, repo: { full_name: 'contributor/cards' } } } }
  ]) {
    const { args, commits } = fixture(options);
    args.fetchImage = () => assert.fail('不应下载图片');
    await localizePullRequest(args);
    assert.deepEqual(commits, []);
  }
});

test('没有远程 URL 时也提交未引用图片的删除，且不重写 YAML', async () => {
  const { args, commits } = fixture({
    source: stringify([{ ...entry, 图片: 'assets/cards/keep.png' }]),
    tree: [
      { path: 'assets/cards/keep.png', type: 'blob', mode: '100644' },
      { path: 'assets/cards/unused.png', type: 'blob', mode: '100644' },
      { path: 'assets/cards/directory.png', type: 'tree', mode: '040000' },
      { path: 'assets/cards/link.png', type: 'blob', mode: '120000' },
      { path: 'assets/cards/README.md', type: 'blob', mode: '100644' },
      { path: 'assets/logos/test.svg', type: 'blob', mode: '100644' }
    ]
  });
  args.fetchImage = () => assert.fail('不应下载图片');
  await localizePullRequest(args);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].fileChanges, { additions: [], deletions: [{ path: 'assets/cards/unused.png' }] });
});

test('PR 清空卡片列表时可以提交全部闲置卡面的删除', async () => {
  const { args, commits } = fixture({ source: '# 空收藏\n' });
  await localizePullRequest(args);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].fileChanges, { additions: [], deletions: [{ path: 'assets/cards/card-1.png' }] });
});

test('下载期间有新提交或 PR 关闭时不把旧资料写回', async () => {
  for (const latest of [
    { state: 'open', head: { ...head, sha: 'new-pr-head' } },
    { state: 'closed', head }
  ]) {
    const { args, commits } = fixture({ latest });
    await localizePullRequest(args);
    assert.deepEqual(commits, []);
  }
});

test('仅清理图片时也检查 PR 是否出现新提交', async () => {
  const { args, commits } = fixture({ source: '[]\n', latest: { state: 'open', head: { ...head, sha: 'new-pr-head' } } });
  await localizePullRequest(args);
  assert.deepEqual(commits, []);
});

test('下载失败不会向 PR 写入部分提交', async () => {
  const { args, commits } = fixture();
  args.fetchImage = async () => new Response('not found', { status: 404 });
  await assert.rejects(localizePullRequest(args), /HTTP 404/);
  assert.deepEqual(commits, []);
});

test('GitHub 拒绝并发写入时向工作流报告失败，不重试覆盖分支', async () => {
  const { args } = fixture();
  let attempts = 0;
  args.github.graphql = async () => { attempts++; throw new Error('expectedHeadOid does not match'); };
  await assert.rejects(localizePullRequest(args), /expectedHeadOid/);
  assert.equal(attempts, 1);
});
