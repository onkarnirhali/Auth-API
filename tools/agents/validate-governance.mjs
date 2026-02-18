import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'AGENTS.md',
  'docs/agents/REPO_SCOPE.md',
  'docs/agents/GOALS_REPO.md',
  'docs/agents/GOALS_AGENT.md',
  'docs/agents/CHANGE_LOG.md',
  'docs/agents/RELEASE_STAGES.md',
  'docs/agents/PR_CHECKLIST.md',
  'docs/agents/OVERRIDES.md',
  'docs/agents/_core_src/AGENTS_CORE.md',
  'docs/agents/_core_src/goals/GOALS_GLOBAL.md',
  'docs/agents/_core_src/workflow/GOAL_ALIGNMENT_GATE.md',
  'docs/agents/_core_src/versions/VERSION.md',
];

const linkCheckFiles = [
  'AGENTS.md',
  'docs/agents/REPO_SCOPE.md',
  'docs/agents/GOALS_REPO.md',
  'docs/agents/GOALS_AGENT.md',
  'docs/agents/CHANGE_LOG.md',
  'docs/agents/RELEASE_STAGES.md',
  'docs/agents/PR_CHECKLIST.md',
  'docs/agents/OVERRIDES.md',
];

const errors = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

for (const rel of requiredFiles) {
  if (!exists(rel)) {
    errors.push(`Missing required file: ${rel}`);
  }
}

const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;

for (const rel of linkCheckFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const content = fs.readFileSync(abs, 'utf8');
  const matches = [...content.matchAll(linkRegex)];
  for (const m of matches) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('#') || raw.startsWith('mailto:')) {
      continue;
    }
    const targetAbs = path.resolve(path.dirname(abs), raw);
    if (!fs.existsSync(targetAbs)) {
      errors.push(`Broken link in ${rel}: ${raw}`);
    }
  }
}

const goalsPath = path.join(root, 'docs/agents/GOALS_REPO.md');
const changePath = path.join(root, 'docs/agents/CHANGE_LOG.md');

const goalIds = new Set();
if (fs.existsSync(goalsPath)) {
  const lines = fs.readFileSync(goalsPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').map((c) => c.trim());
    if (cols.length < 3) continue;
    const id = cols[1];
    if (!id || id === 'goal_id' || id === '---') continue;
    if (/^[A-Z0-9-]+$/.test(id)) {
      goalIds.add(id);
    }
  }
}

if (fs.existsSync(changePath)) {
  const lines = fs.readFileSync(changePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cols = line.split('|').map((c) => c.trim());
    if (cols.length < 8) continue;
    const changeId = cols[1];
    const goalId = cols[3];
    if (!changeId || changeId === 'change_id' || changeId === '---') continue;
    if (!goalIds.has(goalId)) {
      errors.push(`CHANGE_LOG references unknown goal_id: ${goalId} (change_id=${changeId})`);
    }
  }
}

if (errors.length > 0) {
  console.error('Governance validation failed:');
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log('Governance validation passed.');
