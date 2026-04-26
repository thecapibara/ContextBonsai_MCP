import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as process from 'node:process';
import { getSafePath } from '../src/index.js';

describe('Security: getSafePath', () => {
  const BONSAI_ROOT = path.resolve(process.env.BONSAI_ROOT || process.cwd());

  it('should allow paths within BONSAI_ROOT', () => {
    const safe = getSafePath('state.json');
    expect(safe).toBe(path.join(BONSAI_ROOT, 'state.json'));
  });

  it('should allow BONSAI_ROOT itself', () => {
    const safe = getSafePath('.');
    expect(safe).toBe(BONSAI_ROOT);
  });

  it('should block path traversal outside of BONSAI_ROOT', () => {
    expect(() => getSafePath('../outside.txt')).toThrow(/SECURITY ALERT/);
  });

  it('should block prefix-match traversal (vulnerability fix)', () => {
    // If BONSAI_ROOT is /opt/bonsai
    // Malicious path: /opt/bonsai-enterprise-evil
    // This test simulates the case where the target starts with the same string but isn't inside the directory
    
    const rootDir = path.dirname(BONSAI_ROOT);
    const rootName = path.basename(BONSAI_ROOT);
    const evilPath = path.join(rootDir, `${rootName}-evil`);
    
    // We need to pass a path that resolves to exactly this
    const relativeEvil = path.relative(BONSAI_ROOT, evilPath);
    
    expect(() => getSafePath(relativeEvil)).toThrow(/SECURITY ALERT/);
  });
});
