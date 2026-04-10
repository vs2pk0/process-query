import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  DeleteNodeModulesResult,
  NodeModulesUsageEntry,
  NodeModulesUsageResult,
  ScanNodeModulesOptions,
} from '../shared/process';

const execFileAsync = promisify(execFile);
const DEFAULT_RESULT_LIMIT = 120;
const STAT_BATCH_SIZE = 96;

function trimWrappingQuotes(rawPath: string): string {
  const normalized = rawPath.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function normalizeDirectoryPath(rawPath: string): string {
  const strippedPath = trimWrappingQuotes(rawPath);

  if (!strippedPath) {
    throw new Error('请先输入需要扫描的目录，或者通过“选择目录”来指定扫描范围。');
  }

  const expandedPath = strippedPath.startsWith('~/')
    ? path.join(process.env.HOME ?? '', strippedPath.slice(2))
    : strippedPath === '~'
      ? process.env.HOME ?? strippedPath
      : strippedPath;
  const resolvedPath = path.isAbsolute(expandedPath)
    ? path.normalize(expandedPath)
    : path.resolve(expandedPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`没有找到要扫描的目录：${resolvedPath}`);
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`目标路径不是目录：${resolvedPath}`);
  }

  return resolvedPath;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function collectNodeModulesDirectories(rootPath: string): Promise<string[]> {
  const directories: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();

    if (!currentPath) {
      continue;
    }

    if (path.basename(currentPath) === 'node_modules') {
      directories.push(currentPath);
      continue;
    }

    let entries: fs.Dirent[];

    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        continue;
      }

      stack.push(path.join(currentPath, entry.name));
    }
  }

  return directories;
}

async function readDirectorySizes(directoryPaths: string[]): Promise<Map<string, number>> {
  const sizeMap = new Map<string, number>();

  for (const batch of chunkItems(directoryPaths, STAT_BATCH_SIZE)) {
    const { stdout } = await execFileAsync('/usr/bin/du', ['-sk', ...batch], {
      maxBuffer: 1024 * 1024 * 16,
    });

    for (const line of stdout.split('\n')) {
      const normalizedLine = line.trim();

      if (!normalizedLine) {
        continue;
      }

      const match = normalizedLine.match(/^(\d+)\s+(.+)$/);

      if (!match) {
        continue;
      }

      const [, sizeInKb, directoryPath] = match;
      sizeMap.set(path.normalize(directoryPath), Number(sizeInKb) * 1024);
    }
  }

  return sizeMap;
}

async function readLastModifiedTimes(directoryPaths: string[]): Promise<Map<string, string>> {
  const modifiedMap = new Map<string, string>();

  for (const batch of chunkItems(directoryPaths, STAT_BATCH_SIZE)) {
    const { stdout } = await execFileAsync('/usr/bin/stat', ['-f', '%m\t%N', ...batch], {
      maxBuffer: 1024 * 1024 * 8,
    });

    for (const line of stdout.split('\n')) {
      const normalizedLine = line.trim();

      if (!normalizedLine) {
        continue;
      }

      const separatorIndex = normalizedLine.indexOf('\t');

      if (separatorIndex === -1) {
        continue;
      }

      const unixTimestamp = normalizedLine.slice(0, separatorIndex);
      const directoryPath = normalizedLine.slice(separatorIndex + 1);
      const milliseconds = Number(unixTimestamp) * 1000;

      if (!Number.isFinite(milliseconds)) {
        continue;
      }

      modifiedMap.set(path.normalize(directoryPath), new Date(milliseconds).toISOString());
    }
  }

  return modifiedMap;
}

export async function scanNodeModulesUsage(
  options: ScanNodeModulesOptions,
): Promise<NodeModulesUsageResult> {
  const startedAt = Date.now();
  const rootPath = normalizeDirectoryPath(options.rootPath);
  const limit = Number.isInteger(options.limit) && (options.limit ?? 0) > 0
    ? Math.min(options.limit ?? DEFAULT_RESULT_LIMIT, 300)
    : DEFAULT_RESULT_LIMIT;
  const nodeModulesDirectories = await collectNodeModulesDirectories(rootPath);

  if (nodeModulesDirectories.length === 0) {
    return {
      rootPath,
      scannedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      totalSizeBytes: 0,
      totalMatches: 0,
      entries: [],
    };
  }

  const [sizeMap, modifiedMap] = await Promise.all([
    readDirectorySizes(nodeModulesDirectories),
    readLastModifiedTimes(nodeModulesDirectories),
  ]);

  const entries: NodeModulesUsageEntry[] = nodeModulesDirectories
    .map((directoryPath) => {
      const normalizedPath = path.normalize(directoryPath);
      const relativePath = path.relative(rootPath, normalizedPath);

      return {
        path: normalizedPath,
        relativePath: relativePath || 'node_modules',
        sizeBytes: sizeMap.get(normalizedPath) ?? 0,
        lastModifiedAt: modifiedMap.get(normalizedPath) ?? new Date(0).toISOString(),
      };
    })
    .sort((left, right) => right.sizeBytes - left.sizeBytes);

  const totalSizeBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  return {
    rootPath,
    scannedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    totalSizeBytes,
    totalMatches: entries.length,
    entries: entries.slice(0, limit),
  };
}

export async function deleteNodeModulesDirectory(
  targetPath: string,
): Promise<DeleteNodeModulesResult> {
  const normalizedPath = normalizeDirectoryPath(targetPath);

  if (path.basename(normalizedPath) !== 'node_modules') {
    throw new Error('为了避免误删，目前只允许删除名称为 node_modules 的目录。');
  }

  const targetStats = await fs.promises.lstat(normalizedPath);

  if (targetStats.isSymbolicLink()) {
    throw new Error('检测到目标是符号链接，为了安全起见暂不支持直接删除。');
  }

  await fs.promises.rm(normalizedPath, {
    recursive: true,
    force: false,
    maxRetries: 3,
    retryDelay: 200,
  });

  return {
    path: normalizedPath,
    success: true,
    deletedAt: new Date().toISOString(),
  };
}
