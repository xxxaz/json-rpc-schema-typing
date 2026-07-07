/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    // ソースは ESM 形式 (`./foo.js` 拡張子付き import) のため、CJS transform 時に .ts へ解決し直す
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    // per-file の language service 検査は FromSchema (json-schema-to-ts) の深い型で
    // TS2589 を誤発するため transpile-only とし、型検査は test/TypeCheck.test.ts が
    // whole-program の tsc (tsconfig-jest.json) で担保する
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig-jest.json' }],
    },
};
