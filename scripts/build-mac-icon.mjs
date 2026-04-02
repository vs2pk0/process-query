import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceIconPath = path.join(projectRoot, 'build', 'app-icon.png');
const targetIconPath = path.join(projectRoot, 'build', 'app-icon.icns');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'process-query-icon-'));
const iconsetPath = path.join(tempRoot, 'app-icon.iconset');

const iconSizes = [16, 32, 128, 256, 512];

function run(command, args) {
  execFileSync(command, args, {
    stdio: 'inherit',
  });
}

if (process.platform !== 'darwin') {
  throw new Error('仅支持在 macOS 上生成 .icns 图标。');
}

if (!fs.existsSync(sourceIconPath)) {
  throw new Error(`未找到 PNG 图标：${sourceIconPath}`);
}

fs.mkdirSync(iconsetPath, { recursive: true });

for (const size of iconSizes) {
  const outputPath = path.join(iconsetPath, `icon_${size}x${size}.png`);
  const retinaOutputPath = path.join(iconsetPath, `icon_${size}x${size}@2x.png`);

  run('sips', ['-z', String(size), String(size), sourceIconPath, '--out', outputPath]);
  run('sips', ['-z', String(size * 2), String(size * 2), sourceIconPath, '--out', retinaOutputPath]);
}

run('iconutil', ['-c', 'icns', iconsetPath, '-o', targetIconPath]);
fs.rmSync(tempRoot, { recursive: true, force: true });
