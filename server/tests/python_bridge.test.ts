import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('Python AST Bridge', () => {
    it('should extract signatures from test_file.py', async () => {
        const scriptPath = path.resolve('src/python_ast_parser.py');
        const testFilePath = path.resolve('tests/test_file.py');
        
        const { stdout } = await execAsync(`python3 "${scriptPath}" "${testFilePath}"`);
        const result = JSON.parse(stdout);
        
        expect(result).toHaveLength(2);
        
        const cls = result.find(r => r.type === 'class');
        expect(cls.name).toBe('TestProject');
        expect(cls.doc).toBe('Project-level class documentation.');
        expect(cls.methods).toHaveLength(2);
        expect(cls.methods[0].name).toBe('sync_method');
        expect(cls.methods[1].async).toBe(true);
        
        const func = result.find(r => r.type === 'function');
        expect(func.name).toBe('top_level_func');
        expect(func.doc).toBe('A top-level function.');
    });
});
