import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: {
    max: 4,
    max_bytes: 262144,
  },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function safeChmod(targetPath: string, mode: number): void {
  try {
    chmodSync(targetPath, mode);
  } catch {
    // Ignore permission errors on platforms like Windows.
  }
}

function makeTreeReadable(rootPath: string): void {
  const stack: string[] = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = lstatSync(current);
    if (stat.isDirectory()) {
      safeChmod(current, 0o755);
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry));
      }
    } else if (stat.isFile()) {
      safeChmod(current, 0o644);
    }
  }
}

function mirrorDirectory(sourceDir: string, destinationDir: string): void {
  rmSync(destinationDir, { recursive: true, force: true });
  cpSync(sourceDir, destinationDir, { recursive: true });
}

function run(): void {
  const repoRoot = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  mkdirSync(outDir, { recursive: true });

  for (const folder of ['game', 'screenshots'] as const) {
    mirrorDirectory(join(repoRoot, folder), join(outDir, folder));
  }

  const dossierPayload = buildDossier(outDir, DOSSIER_CAPS);
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossierPayload);

  makeTreeReadable(outDir);
}

run();
