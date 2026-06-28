import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, parse, resolve } from 'path';
import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';

export interface TerminalSessionInfo {
  id: string;
  cwd: string;
  shell: string;
  pid: number | null;
}

interface TerminalSession {
  id: string;
  cwd: string;
  shell: string;
  pty: IPty;
  killed: boolean;
  dataBuffer: string;
  inputBuffer: string;
  cwdStack: string[];
  previousCwd: string | null;
}

const CWD_MARKER_START = '__CPC_CWD__';
const CWD_MARKER_END = '__CPC_CWD_END__';
const CWD_PATTERN = /__CPC_CWD__(.*?)__CPC_CWD_END__/s;
const HIDDEN_CWD_PATTERN = /\u001b\[8m__CPC_CWD__(.*?)__CPC_CWD_END__\u001b\[0m/s;
const HIDDEN_CWD_MARKER_OUTPUT_PATTERN = /\u001b\[8m__CPC_CWD__.*?__CPC_CWD_END__\u001b\[0m/gs;
const PLAIN_CWD_MARKER_OUTPUT_PATTERN = /__CPC_CWD__.*?__CPC_CWD_END__/gs;
const POWERSHELL_CWD_PROBE_ECHO_PATTERN = /\[Console\]::Write\("\$\(\[char\]27\)\[8m.*?\$\(\[char\]27\)\[0m"\)\r?\n?/gs;
const CWD_MARKER_BUFFER_LIMIT = 4096;
const ANSI_SEQUENCE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

export class TerminalSessionService {
  public onData: ((sessionId: string, data: string) => void) | null = null;
  public onCwd: ((sessionId: string, cwd: string) => void) | null = null;
  public onExit: ((sessionId: string, exitCode: number | null, signal?: number) => void) | null = null;
  public onError: ((sessionId: string | undefined, message: string) => void) | null = null;

  private sessions: Map<string, TerminalSession> = new Map();

  createSession(options: { cwd?: string; shell?: string; cols: number; rows: number }): TerminalSessionInfo {
    const cwd = this.resolveCwd(options.cwd);
    const shell = options.shell || this.getDefaultShell();
    const id = randomUUID();

    try {
      const ptyProcess = spawn(shell, [], {
        name: 'xterm-256color',
        cwd,
        cols: options.cols,
        rows: options.rows,
        env: process.env,
      });

      const session: TerminalSession = {
        id,
        cwd,
        shell,
        pty: ptyProcess,
        killed: false,
        dataBuffer: '',
        inputBuffer: '',
        cwdStack: [],
        previousCwd: null,
      };

      this.sessions.set(id, session);

      ptyProcess.onData((data) => {
        this.handleData(session, data);
      });

      ptyProcess.onExit((event) => {
        this.sessions.delete(id);
        this.onExit?.(id, event.exitCode ?? null, event.signal);
      });

      return {
        id,
        cwd,
        shell,
        pid: typeof ptyProcess.pid === 'number' ? ptyProcess.pid : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create terminal session';
      this.onError?.(undefined, message);
      throw err;
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.write(data);
    this.trackInputForDirectoryChange(session, data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.resize(cols, rows);
  }

  requestCwd(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pty.write(this.getCwdProbeCommand(session.shell));
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.killed) return;
    session.killed = true;
    try {
      session.pty.kill();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill terminal session';
      this.onError?.(sessionId, message);
    }
  }

  killAll(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      this.kill(sessionId);
    }
  }

  private handleData(session: TerminalSession, data: string): void {
    const combinedData = session.dataBuffer + data;
    if (this.shouldBufferCwdMarker(combinedData)) {
      session.dataBuffer = combinedData.slice(-CWD_MARKER_BUFFER_LIMIT);
      return;
    }

    session.dataBuffer = '';
    const isPowerShell = this.isPowerShell(session.shell);
    const match = isPowerShell ? HIDDEN_CWD_PATTERN.exec(combinedData) : CWD_PATTERN.exec(combinedData);
    let visibleData = combinedData.replace(HIDDEN_CWD_MARKER_OUTPUT_PATTERN, '');

    if (isPowerShell) {
      visibleData = visibleData.replace(POWERSHELL_CWD_PROBE_ECHO_PATTERN, '');
      visibleData = visibleData.replace(PLAIN_CWD_MARKER_OUTPUT_PATTERN, '');
    } else {
      visibleData = visibleData.replace(PLAIN_CWD_MARKER_OUTPUT_PATTERN, '');
    }

    if (visibleData) {
      this.onData?.(session.id, visibleData);
    }

    if (!match) return;

    const cwd = match[1].trim();
    if (!cwd) return;

    session.cwd = cwd;
    this.onCwd?.(session.id, cwd);
  }

  private resolveCwd(cwd?: string): string {
    const resolved = resolve(cwd || process.cwd());
    if (!existsSync(resolved)) {
      throw new Error(`cwd does not exist: ${resolved}`);
    }
    return resolved;
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return 'pwsh.exe';
    }
    return process.env.SHELL || 'bash';
  }

  private getCwdProbeCommand(shell: string): string {
    const normalizedShell = shell.toLowerCase();

    if (process.platform === 'win32' && normalizedShell.includes('cmd')) {
      return `echo ${CWD_MARKER_START}%CD%${CWD_MARKER_END}\r`;
    }

    if (this.isPowerShell(shell)) {
      return `[Console]::Write("$([char]27)[8m${CWD_MARKER_START}$((Get-Location).Path)${CWD_MARKER_END}$([char]27)[0m")\r`;
    }

    return `printf '${CWD_MARKER_START}%s${CWD_MARKER_END}\\n' "$PWD"\n`;
  }

  private isPowerShell(shell: string): boolean {
    const normalizedShell = shell.toLowerCase();
    return normalizedShell.includes('powershell') || normalizedShell.includes('pwsh');
  }

  private trackInputForDirectoryChange(session: TerminalSession, data: string): void {
    const visibleInput = data.replace(ANSI_SEQUENCE_PATTERN, '');

    for (const char of visibleInput) {
      if (char === '\r' || char === '\n') {
        const cwd = this.resolveDirectoryChange(session, session.inputBuffer);
        if (cwd) {
          this.emitCwdChange(session, cwd);
        }
        session.inputBuffer = '';
        continue;
      }

      if (char === '\u007f' || char === '\b') {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        continue;
      }

      if (char >= ' ') {
        session.inputBuffer += char;
      }
    }
  }

  private resolveDirectoryChange(session: TerminalSession, command: string): string | null {
    const trimmed = command.trim();
    if (!trimmed) return null;

    if (/^[a-zA-Z]:$/.test(trimmed)) {
      return this.resolveExistingDirectory(`${trimmed}\\`, session.cwd);
    }

    const parts = this.splitCommandLine(trimmed);
    const commandName = parts[0]?.toLowerCase();
    if (!commandName) return null;

    if (commandName === 'popd') {
      return session.cwdStack.pop() || null;
    }

    const isPushd = commandName === 'pushd';
    if (!isPushd && !['cd', 'chdir', 'sl', 'set-location'].includes(commandName)) {
      return null;
    }

    const target = this.extractPathArgument(parts.slice(1));
    if (!target) return null;

    if (target === '-' && session.previousCwd) {
      return session.previousCwd;
    }

    const resolved = this.resolveExistingDirectory(target, session.cwd);
    if (resolved && isPushd) {
      session.cwdStack.push(session.cwd);
    }
    return resolved;
  }

  private emitCwdChange(session: TerminalSession, cwd: string): void {
    if (cwd === session.cwd) return;
    session.previousCwd = session.cwd;
    session.cwd = cwd;
    this.onCwd?.(session.id, cwd);
  }

  private extractPathArgument(args: string[]): string | null {
    if (args.length === 0) return null;
    const pathFlagIndex = args.findIndex((arg) => ['-path', '-literalpath'].includes(arg.toLowerCase()));
    if (pathFlagIndex >= 0) {
      return args[pathFlagIndex + 1] || null;
    }
    return args.find((arg) => !arg.startsWith('-')) || null;
  }

  private resolveExistingDirectory(target: string, cwd: string): string | null {
    const home = homedir();
    const normalizedTarget = target === '~'
      ? home
      : target.startsWith('~\\') || target.startsWith('~/')
        ? resolve(home, target.slice(2))
        : target === '/'
          ? parse(cwd).root
          : target;
    const resolved = isAbsolute(normalizedTarget) ? resolve(normalizedTarget) : resolve(cwd, normalizedTarget);
    return existsSync(resolved) ? resolved : null;
  }

  private splitCommandLine(command: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: '"' | '\'' | null = null;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if ((char === '"' || char === "'") && !quote) {
        quote = char;
        continue;
      }
      if (quote === char) {
        quote = null;
        continue;
      }
      if (!quote && /\s/.test(char)) {
        if (current) {
          parts.push(current);
          current = '';
        }
        continue;
      }
      current += char;
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  private shouldBufferCwdMarker(data: string): boolean {
    const hiddenStart = data.lastIndexOf(`\u001b[8m${CWD_MARKER_START}`);
    if (hiddenStart >= 0 && data.indexOf(`${CWD_MARKER_END}\u001b[0m`, hiddenStart) < 0) {
      return true;
    }

    const plainStart = data.lastIndexOf(CWD_MARKER_START);
    if (plainStart >= 0 && data.indexOf(CWD_MARKER_END, plainStart) < 0) {
      return true;
    }

    const probeEchoStart = data.lastIndexOf('[Console]::Write("$([char]27)[8m');
    if (probeEchoStart >= 0 && data.indexOf('$([char]27)[0m")', probeEchoStart) < 0) {
      return true;
    }

    return false;
  }
}
