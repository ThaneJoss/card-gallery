import { localizeCardImages } from './localize-card-images.mjs';

export async function localizePullRequest({ github, context, core, fetchImage = fetch }) {
  const request = { ...context.repo, pull_number: context.payload.pull_request.number };
  const { data: pr } = await github.rest.pulls.get(request);
  if (pr.state !== 'open') return;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (pr.head.repo?.full_name !== repository) {
    core.warning('Fork PR 无法使用本仓库 GITHUB_TOKEN 回写，请在来源分支运行 pnpm localize:cards 并提交生成的文件。');
    return;
  }

  // 只读取 PR 的资料和目录；执行的脚本及依赖始终来自受信任的默认分支。
  const [{ data: file }, { data: tree }] = await Promise.all([
    github.rest.repos.getContent({ ...context.repo, path: 'cards.yaml', ref: pr.head.sha }),
    github.rest.git.getTree({ ...context.repo, tree_sha: pr.head.sha, recursive: '1' })
  ]);
  if (file.type !== 'file' || file.encoding !== 'base64') throw new Error('cards.yaml 必须是可读取的普通文件。');
  if (tree.truncated) throw new Error('PR 文件目录未完整返回，无法确认卡面文件和清理范围。');
  const result = await localizeCardImages({
    source: Buffer.from(file.content, 'base64').toString('utf8'),
    existingPaths: tree.tree.map(entry => entry.path),
    existingFiles: tree.tree.filter(entry => entry.type === 'blob' && entry.mode !== '120000').map(entry => entry.path),
    fetchImage
  });
  if (!result.changedCards && !result.deletedImages.length) {
    core.info('所有卡面已使用本地路径，且没有未引用图片，无需追加提交。');
    return;
  }

  const { data: latest } = await github.rest.pulls.get(request);
  if (latest.state !== 'open' || latest.head.sha !== pr.head.sha) {
    core.notice('PR 已关闭或出现新提交，本次不回写；新提交会重新触发处理。');
    return;
  }

  // 图片新增、删除和 YAML 原子提交；expectedHeadOid 保证并发推送不会被覆盖。
  await github.graphql(`
    mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { url } }
    }
  `, {
    input: {
      branch: { repositoryNameWithOwner: repository, branchName: pr.head.ref },
      expectedHeadOid: pr.head.sha,
      message: { headline: '自动本地化卡面并清理未引用图片' },
      fileChanges: {
        additions: [
          ...(result.changedCards ? [{ path: 'cards.yaml', contents: Buffer.from(result.source).toString('base64') }] : []),
          ...result.images.map(({ path, content }) => ({ path, contents: content.toString('base64') }))
        ],
        deletions: result.deletedImages.map(path => ({ path }))
      }
    }
  });
  core.notice(`已向 PR 追加提交：更新 ${result.changedCards} 张卡片，保存 ${result.images.length} 个图片文件，清理 ${result.deletedImages.length} 个未引用图片。`);
}
