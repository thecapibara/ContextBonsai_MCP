import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { getPythonMatches, walkDir } from '../src/index.js';

describe('Logic: getPythonMatches', () => {
  it('should match standard def', () => {
    const { defMatch } = getPythonMatches('def my_func():');
    expect(defMatch![1]).toBe('my_func');
  });

  it('should match async def', () => {
    const { defMatch } = getPythonMatches('async def my_func():');
    expect(defMatch![1]).toBe('my_func');
  });

  it('should match class', () => {
    const { classMatch } = getPythonMatches('class MyClass:');
    expect(classMatch![1]).toBe('MyClass');
  });

  it('should match decorator', () => {
    const { decoratorMatch } = getPythonMatches('@my_decorator');
    expect(decoratorMatch![1]).toBe('my_decorator');
  });

  it('should match complex decorator', () => {
    const { decoratorMatch } = getPythonMatches('  @library.module.decorator(args)');
    expect(decoratorMatch![1]).toBe('library.module.decorator');
  });
});

describe('Stability: walkDir limit', () => {
  it('should exist and be a function', () => {
    expect(typeof walkDir).toBe('function');
  });
});
