import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function parseSemver(str) {
  const m = String(str || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'komari-theme.json'), 'utf8')
);
const baseVer = parseSemver(manifest.version) || [1, 0, 0];

const githubRef = process.env.GITHUB_REF || '';
const eventName = process.env.GITHUB_EVENT_NAME || '';

// 1. Explicit version tag push (e.g. refs/tags/v1.2.0)
if (githubRef.startsWith('refs/tags/')) {
  const rawTag = githubRef.slice('refs/tags/'.length);
  const parsed = parseSemver(rawTag);
  if (parsed) {
    const version = parsed.join('.');
    const tag = `v${version}`;
    process.stdout.write(`version=${version}\ntag=${tag}\nshould_release=true\n`);
    process.exit(0);
  }
}

// 2. Pull requests only test build, do not create releases
if (eventName === 'pull_request') {
  const version = baseVer.join('.');
  process.stdout.write(`version=${version}\ntag=v${version}\nshould_release=false\n`);
  process.exit(0);
}

// 3. Push to main or workflow_dispatch: compare manifest version against existing git tags
let highestTag = null;
try {
  const out = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' });
  for (const line of out.split(/\r?\n/)) {
    const sv = parseSemver(line);
    if (sv && (!highestTag || compareSemver(sv, highestTag) > 0)) {
      highestTag = sv;
    }
  }
} catch {
  // Ignore git tag lookup failure
}

let nextVer = baseVer;
if (highestTag) {
  if (compareSemver(baseVer, highestTag) > 0) {
    // Manifest version was manually bumped higher than latest tag
    nextVer = baseVer;
  } else {
    // Auto-increment patch version on main push
    nextVer = [highestTag[0], highestTag[1], highestTag[2] + 1];
  }
}

const version = nextVer.join('.');
const tag = `v${version}`;
process.stdout.write(`version=${version}\ntag=${tag}\nshould_release=true\n`);
