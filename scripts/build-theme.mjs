import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const distIndex = path.join(rootDir, 'dist', 'index.html');
const manifestPath = path.join(rootDir, 'komari-theme.json');
const previewPath = path.join(rootDir, 'preview.png');
const releaseDir = path.join(rootDir, 'release');
const zipPath = path.join(releaseDir, 'komari-theme-zachary.zip');
const stagedManifestPath = path.join(releaseDir, 'komari-theme.staged.json');

if (!fs.existsSync(distIndex)) {
  console.error('❌ dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

const html = fs.readFileSync(distIndex, 'utf8');
if (!html.includes('<title>Komari Monitor</title>')) {
  console.error('❌ Required placeholder <title>Komari Monitor</title> missing in dist/index.html');
  process.exit(1);
}
if (!html.includes('A simple server monitor tool.')) {
  console.error('❌ Required meta description placeholder missing in dist/index.html');
  process.exit(1);
}
if (!fs.existsSync(manifestPath)) {
  console.error('❌ komari-theme.json missing in project root');
  process.exit(1);
}
if (!fs.existsSync(previewPath)) {
  console.warn('⚠️ preview.png not found in root; packaging without preview image.');
}

fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const manifestObj = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const resolvedVersion = (process.env.THEME_VERSION || manifestObj.version || '1.0.0').replace(
  /^v/i,
  ''
);
manifestObj.version = resolvedVersion;
fs.writeFileSync(stagedManifestPath, JSON.stringify(manifestObj, null, 2) + '\n', 'utf8');

const pyScript = `
import os, zipfile

root = ${JSON.stringify(rootDir)}
staged_manifest = ${JSON.stringify(stagedManifestPath)}
out_zip = ${JSON.stringify(zipPath)}

with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write(staged_manifest, 'komari-theme.json')
    preview = os.path.join(root, 'preview.png')
    if os.path.exists(preview):
        zf.write(preview, 'preview.png')
    dist_dir = os.path.join(root, 'dist')
    for dirpath, _, filenames in os.walk(dist_dir):
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root)
            zf.write(full, rel)
`;

execFileSync('python3', ['-c', pyScript], { stdio: 'inherit' });
fs.unlinkSync(stagedManifestPath);

const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const sizeKB = (fs.statSync(zipPath).size / 1024).toFixed(1);

console.log(`✅ Komari theme v${resolvedVersion} packaged: ${zipPath} (${sizeKB} KB)`);
console.log(`🔒 SHA-256: ${hash}`);
