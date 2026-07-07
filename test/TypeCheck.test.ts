import { execFileSync } from 'child_process';
import { resolve } from 'path';

// ts-jest は transpile-only (jest.config.cjs 参照) のため、
// コンパイルレベルの型検証 (SchemaTreeTypes.test.ts の Assert 群を含む) はここで tsc を通して担保する
describe('typecheck', () => {
    test('tsc -p tsconfig-jest.json が型エラーなしで通る', () => {
        const root = resolve(__dirname, '..');
        const tsc = resolve(root, 'node_modules', '.bin', 'tsc');
        expect(() => {
            execFileSync(tsc, ['-p', resolve(root, 'tsconfig-jest.json')], {
                cwd: root,
                stdio: 'pipe',
            });
        }).not.toThrow();
    }, 120_000);
});
