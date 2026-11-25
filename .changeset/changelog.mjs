import githubChangelog from '@changesets/changelog-github';
import { getCommitInfo } from '@changesets/get-github-info';

async function getDependencyReleaseLine(changesets, dependencies, { repo }) {
  if (dependencies.length === 0) return '';

  const commits = [...new Set(changesets.map(({ commit }) => commit).filter(Boolean))].sort();
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const references = await Promise.all(commits.map(async commit => {
    const info = await getCommitInfo({ commit, repo });
    return {
      pullNumber: info?.pull?.number ?? Number.MAX_SAFE_INTEGER,
      link: info?.pull?.markdownLink ?? info?.commit?.markdownLink
        ?? `[\`${commit.slice(0, 7)}\`](${server}/${repo}/commit/${commit})`,
    };
  }));
  references.sort((left, right) => left.pullNumber - right.pullNumber);
  const links = [...new Set(references.map(({ link }) => link))];
  const heading = links.length ? `- Updated dependencies (${links.join(', ')})` : '- Updated dependencies';

  return [heading, ...dependencies.map(({ name, newVersion }) => `  - ${name}@${newVersion}`)].join('\n');
}

export default { getReleaseLine: githubChangelog.getReleaseLine, getDependencyReleaseLine };
