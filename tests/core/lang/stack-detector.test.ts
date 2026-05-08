// tests/core/lang/stack-detector.test.ts
//
// Sprint 162A Bug B fix — multi-language adapter pattern.
// Six baseline stacks auto-detection scenarios using mocked node:fs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// Mock the existing project stack detector so Layer-1 path is deterministic.
vi.mock('../../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(),
}));

import * as fs from 'node:fs';
import { detectStack } from '../../../src/core/lang/stack-detector.js';
import { detectProjectStack } from '../../../src/core/stack-detector.js';
import type { ProjectStack } from '../../../src/core/skill-types.js';

const ROOT = '/test/project';

function mockExistingFiles(files: string[]): void {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const s = String(p);
    return files.some((f) => s.endsWith(f));
  });
}

function mockReaddir(entries: string[]): void {
  // node:fs readdirSync has multiple overloads; cast to any to satisfy mock typing
  vi.mocked(fs.readdirSync).mockImplementation(((..._args: unknown[]) => entries) as never);
}

function mockProjectStack(language: string | null): void {
  if (language === null) {
    vi.mocked(detectProjectStack).mockImplementation(() => {
      throw new Error('not detected');
    });
    return;
  }
  vi.mocked(detectProjectStack).mockReturnValue({
    language,
    framework: '',
    dependencies: [],
    buildTool: '',
    testFramework: '',
    detectedAt: '2026-05-08T00:00:00.000Z',
  } satisfies ProjectStack);
}

describe('detectStack — Layer 1 (cached project-stack.json)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file-presence walk finds nothing; only Layer 1 can answer.
    mockExistingFiles([]);
    mockReaddir([]);
  });

  it('detects typescript via cached project-stack', () => {
    mockProjectStack('typescript');
    expect(detectStack(ROOT)).toBe('typescript');
  });

  it('detects python via cached project-stack', () => {
    mockProjectStack('python');
    expect(detectStack(ROOT)).toBe('python');
  });

  it('detects go via cached project-stack', () => {
    mockProjectStack('go');
    expect(detectStack(ROOT)).toBe('go');
  });

  it('detects rust via cached project-stack', () => {
    mockProjectStack('rust');
    expect(detectStack(ROOT)).toBe('rust');
  });

  it('detects java via cached project-stack', () => {
    mockProjectStack('java');
    expect(detectStack(ROOT)).toBe('java');
  });

  it('maps kotlin to java via cached project-stack', () => {
    mockProjectStack('kotlin');
    expect(detectStack(ROOT)).toBe('java');
  });

  it('detects csharp via cached project-stack', () => {
    mockProjectStack('csharp');
    expect(detectStack(ROOT)).toBe('csharp');
  });

  it('maps javascript to typescript (shared vitest tooling)', () => {
    mockProjectStack('javascript');
    expect(detectStack(ROOT)).toBe('typescript');
  });
});

describe('detectStack — Layer 2 (file-presence walk)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make Layer-1 throw so Layer-2 must run.
    mockProjectStack(null);
  });

  it('detects typescript when package.json + tsconfig.json present', () => {
    mockExistingFiles(['package.json', 'tsconfig.json']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('typescript');
  });

  it('detects python when pyproject.toml present', () => {
    mockExistingFiles(['pyproject.toml']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('python');
  });

  it('detects go when go.mod present', () => {
    mockExistingFiles(['go.mod']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('go');
  });

  it('detects rust when Cargo.toml present', () => {
    mockExistingFiles(['Cargo.toml']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('rust');
  });

  it('detects java when pom.xml present', () => {
    mockExistingFiles(['pom.xml']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('java');
  });

  it('detects csharp via *.csproj glob', () => {
    mockExistingFiles([]);
    mockReaddir(['MyApp.csproj', 'Program.cs']);
    expect(detectStack(ROOT)).toBe('csharp');
  });

  it('returns null when nothing matches', () => {
    mockExistingFiles([]);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBeNull();
  });

  it('is resilient to readdir throwing (returns null cleanly)', () => {
    mockExistingFiles([]);
    vi.mocked(fs.readdirSync).mockImplementation((() => {
      throw new Error('EACCES');
    }) as never);
    expect(detectStack(ROOT)).toBeNull();
  });
});

describe('detectStack — Layer-1 vs Layer-2 priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers cached project-stack over file walk when both exist', () => {
    // Cache says python; filesystem says go (go.mod present)
    mockProjectStack('python');
    mockExistingFiles(['go.mod']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('python');
  });

  it('falls through to Layer-2 when cached language is unknown to lang adapter', () => {
    mockProjectStack('elixir'); // not in projectStackToStackId switch
    mockExistingFiles(['go.mod']);
    mockReaddir([]);
    expect(detectStack(ROOT)).toBe('go');
  });
});
