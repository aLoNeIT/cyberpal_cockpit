import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

const { existsSyncMock, spawnMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}));

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
}));

import { TerminalSessionService } from '../TerminalSessionService.js';

function createMockPty() {
  const dataHandlers: Array<(data: string) => void> = [];
  const exitHandlers: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  const pty = new EventEmitter() as EventEmitter & {
    pid: number;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    onData: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
    emitData: (data: string) => void;
    emitExit: (event: { exitCode: number; signal?: number }) => void;
  };

  pty.pid = 1234;
  pty.write = vi.fn();
  pty.resize = vi.fn();
  pty.kill = vi.fn();
  pty.onData = vi.fn((handler: (data: string) => void) => {
    dataHandlers.push(handler);
    return { dispose: vi.fn() };
  });
  pty.onExit = vi.fn((handler: (event: { exitCode: number; signal?: number }) => void) => {
    exitHandlers.push(handler);
    return { dispose: vi.fn() };
  });
  pty.emitData = (data: string) => dataHandlers.forEach((handler) => handler(data));
  pty.emitExit = (event: { exitCode: number; signal?: number }) => exitHandlers.forEach((handler) => handler(event));
  return pty;
}

describe('TerminalSessionService', () => {
  let service: TerminalSessionService;
  let mockPty: ReturnType<typeof createMockPty>;

  beforeEach(() => {
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(true);
    spawnMock.mockReset();
    mockPty = createMockPty();
    spawnMock.mockReturnValue(mockPty);
    service = new TerminalSessionService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('spawns a PTY with shell, cwd, cols, and rows', () => {
    const info = service.createSession({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      shell: 'powershell.exe',
      cols: 120,
      rows: 40,
    });

    expect(info.id).toBeTruthy();
    expect(info.cwd).toBe('E:\\Work\\Web\\cyberpal_cockpit');
    expect(info.shell).toBe('powershell.exe');
    expect(info.pid).toBe(1234);
    expect(spawnMock).toHaveBeenCalledWith('powershell.exe', [], expect.objectContaining({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      cols: 120,
      rows: 40,
      env: process.env,
    }));
  });

  it('defaults to pwsh.exe on Windows when no shell is provided', () => {
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');

    const info = service.createSession({ cols: 80, rows: 24 });

    expect(info.shell).toBe('pwsh.exe');
    expect(spawnMock).toHaveBeenCalledWith('pwsh.exe', [], expect.any(Object));
    expect(mockPty.write).not.toHaveBeenCalled();
  });

  it('writes input and resizes the PTY', () => {
    const info = service.createSession({ shell: 'bash', cols: 80, rows: 24 });

    service.write(info.id, 'node -v\r');
    service.resize(info.id, 100, 30);

    expect(mockPty.write).toHaveBeenCalledWith('node -v\r');
    expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
  });

  it('emits cwd after directory-changing commands are submitted', () => {
    const onCwd = vi.fn();
    service.onCwd = onCwd;
    const info = service.createSession({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      shell: 'pwsh.exe',
      cols: 80,
      rows: 24,
    });
    existsSyncMock.mockImplementation((path: string) => path === 'E:\\Work\\Web\\cyberpal_cockpit\\backend');

    service.write(info.id, 'node -v\r');
    service.write(info.id, 'cd backend\r');

    expect(mockPty.write.mock.calls.map((call) => call[0])).toEqual([
      'node -v\r',
      'cd backend\r',
    ]);
    expect(onCwd).toHaveBeenCalledWith(info.id, 'E:\\Work\\Web\\cyberpal_cockpit\\backend');
  });

  it('emits cwd when a pasted directory-changing command includes terminal control sequences', () => {
    const onCwd = vi.fn();
    service.onCwd = onCwd;
    const info = service.createSession({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      shell: 'pwsh.exe',
      cols: 80,
      rows: 24,
    });
    existsSyncMock.mockImplementation((path: string) => path === 'E:\\Work\\Web\\cyberpal_cockpit\\backend');

    service.write(info.id, '\u001b[200~cd backend\u001b[201~\r');

    expect(mockPty.write).toHaveBeenCalledWith('\u001b[200~cd backend\u001b[201~\r');
    expect(onCwd).toHaveBeenCalledWith(info.id, 'E:\\Work\\Web\\cyberpal_cockpit\\backend');
  });

  it('emits raw data and parses cwd markers from PTY output', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    service.onData = onData;
    service.onCwd = onCwd;
    const info = service.createSession({ shell: 'bash', cols: 80, rows: 24 });

    mockPty.emitData('before __CPC_CWD__E:\\Work\\Web__CPC_CWD_END__ after');

    expect(onData).toHaveBeenCalledWith(info.id, 'before  after');
    expect(onCwd).toHaveBeenCalledWith(info.id, 'E:\\Work\\Web');
  });

  it('strips hidden cwd marker escape sequences before emitting terminal data', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    service.onData = onData;
    service.onCwd = onCwd;
    const info = service.createSession({ cols: 80, rows: 24 });

    mockPty.emitData('\u001b[8m__CPC_CWD__E:\\Work\\Web\\backend__CPC_CWD_END__\u001b[0mPS E:\\Work>');

    expect(onData).toHaveBeenCalledWith(info.id, 'PS E:\\Work>');
    expect(onCwd).toHaveBeenCalledWith(info.id, 'E:\\Work\\Web\\backend');
  });

  it('parses hidden cwd markers split across PTY data chunks', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    service.onData = onData;
    service.onCwd = onCwd;
    const info = service.createSession({ shell: 'pwsh.exe', cols: 80, rows: 24 });

    mockPty.emitData('\u001b[8m__CPC_CWD__E:\\Work\\Web');
    mockPty.emitData('\\backend__CPC_CWD_END__\u001b[0mPS E:\\Work>');

    expect(onData).toHaveBeenCalledWith(info.id, 'PS E:\\Work>');
    expect(onCwd).toHaveBeenCalledWith(info.id, 'E:\\Work\\Web\\backend');
  });

  it('ignores PowerShell echoed cwd probe commands with syntax highlighted expressions', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    service.onData = onData;
    service.onCwd = onCwd;
    const info = service.createSession({ shell: 'pwsh.exe', cols: 80, rows: 24 });

    const echoedProbe =
      '[Console]::Write("$([char]27)[8m__CPC_CWD__$((\u001b[93mGet-Location\u001b[m).Path)__CPC_CWD_END__$([char]27)[0m")';
    mockPty.emitData(echoedProbe);

    expect(onData).not.toHaveBeenCalled();
    expect(onCwd).not.toHaveBeenCalled();
  });

  it('ignores PowerShell echoed cwd marker fragments with ANSI syntax highlighting', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    service.onData = onData;
    service.onCwd = onCwd;
    const info = service.createSession({ shell: 'pwsh.exe', cols: 80, rows: 24 });

    mockPty.emitData('__CPC_CWD__\u001b[m$((\u001b[93mGet-Location\u001b[m).Path)\u001b[36m__CPC_CWD_END__');

    expect(onData).not.toHaveBeenCalled();
    expect(onCwd).not.toHaveBeenCalled();
  });

  it('writes a cwd probe command for the session shell', () => {
    const info = service.createSession({ shell: 'cmd.exe', cols: 80, rows: 24 });

    service.requestCwd(info.id);

    expect(mockPty.write).toHaveBeenCalledWith(expect.stringContaining('__CPC_CWD__%CD%__CPC_CWD_END__'));
  });

  it('writes a one-shot hidden cwd probe for PowerShell sessions', () => {
    const info = service.createSession({ shell: 'pwsh.exe', cols: 80, rows: 24 });

    service.requestCwd(info.id);

    expect(mockPty.write).toHaveBeenCalledTimes(1);
    expect(mockPty.write).toHaveBeenCalledWith(expect.stringContaining('[Console]::Write'));
    expect(mockPty.write).toHaveBeenCalledWith(expect.stringContaining('__CPC_CWD__'));
  });

  it('uses a POSIX cwd probe for sh-compatible shells', () => {
    const info = service.createSession({ shell: 'bash', cols: 80, rows: 24 });

    service.requestCwd(info.id);

    expect(mockPty.write).toHaveBeenCalledWith(expect.stringContaining("printf '__CPC_CWD__%s__CPC_CWD_END__\\n' \"$PWD\""));
  });

  it('kills sessions and emits exit once', () => {
    const onExit = vi.fn();
    service.onExit = onExit;
    const info = service.createSession({ cols: 80, rows: 24 });

    service.kill(info.id);
    mockPty.emitExit({ exitCode: 0 });
    service.kill(info.id);

    expect(mockPty.kill).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(info.id, 0, undefined);
  });
});
