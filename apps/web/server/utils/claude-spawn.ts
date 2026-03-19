// apps/web/server/utils/claude-spawn.ts
// Spawn Claude CLI using child_process (no native dependency needed)
import { spawn } from 'node:child_process';

export interface ClaudeSpawnOptions {
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface ClaudeChild {
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (info: { exitCode: number }) => void) => void;
  kill: () => void;
}

export function spawnClaude(
  binPath: string,
  opts: ClaudeSpawnOptions,
): ClaudeChild {
  const child = spawn(binPath, opts.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const dataCallbacks: ((data: string) => void)[] = [];
  const exitCallbacks: ((info: { exitCode: number }) => void)[] = [];

  child.stdout.on('data', (chunk: { toString(): string }) => {
    for (const cb of dataCallbacks) cb(chunk.toString());
  });

  child.stderr.on('data', (chunk: { toString(): string }) => {
    for (const cb of dataCallbacks) cb(chunk.toString());
  });

  // Close stdin so the child process receives EOF and doesn't hang waiting for input
  child.stdin.end();

  child.on('close', (code) => {
    for (const cb of exitCallbacks) cb({ exitCode: code ?? 1 });
  });

  return {
    onData: (cb) => dataCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
    kill: () => child.kill(),
  };
}
