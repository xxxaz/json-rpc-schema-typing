import { JsonRpcMethodDefinition } from '../src/JsonRpcMethod.js';
import { StaticRouter } from '../src/router/StaticRouter.js';
import { $Number, $String } from '../src/schemas/Primitive.js';
import { $Object } from '../src/schemas/Structure.js';
import { JsonRpcServer } from '../src/server/JsonRpcServer.js';

const byName = JsonRpcMethodDefinition.builder
    .paramsByName({ name: $String })
    .return($String)
    .define(async ({ name }) => `hello ${name}`);

const byPositionSingleObject = JsonRpcMethodDefinition.builder
    .paramsByPosition($Object({ reserve_id: $Number }))
    .return($Number)
    .define(async ({ reserve_id }) => reserve_id);

const byPositionMulti = JsonRpcMethodDefinition.builder
    .paramsByPosition($Number, $Number)
    .return($Number)
    .define(async (a, b) => a + b);

describe('JsonRpcServer params 正規化', () => {
    const server = new JsonRpcServer(
        new StaticRouter({
            byName,
            byPositionSingleObject,
            byPositionMulti,
        }),
    );

    test('by-name は object params で呼べる', async () => {
        const response = await server.call(
            {},
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'byName',
                params: { name: 'world' },
            },
        );
        expect(response).toEqual({
            jsonrpc: '2.0',
            id: 1,
            result: 'hello world',
        });
    });

    test('by-position は array params で呼べる (従来動作)', async () => {
        const response = await server.call(
            {},
            {
                jsonrpc: '2.0',
                id: 2,
                method: 'byPositionMulti',
                params: [1, 2],
            },
        );
        expect(response).toEqual({ jsonrpc: '2.0', id: 2, result: 3 });

        const single = await server.call(
            {},
            {
                jsonrpc: '2.0',
                id: 3,
                method: 'byPositionSingleObject',
                params: [{ reserve_id: 42 }],
            },
        );
        expect(single).toEqual({ jsonrpc: '2.0', id: 3, result: 42 });
    });

    test('by-position (単一オブジェクト引数) は object params でも単一位置引数として解釈される', async () => {
        // スキーマレス client (パスビルダ) は単一オブジェクト引数を object params として送るため
        const response = await server.call(
            {},
            {
                jsonrpc: '2.0',
                id: 4,
                method: 'byPositionSingleObject',
                params: { reserve_id: 42 },
            },
        );
        expect(response).toEqual({ jsonrpc: '2.0', id: 4, result: 42 });
    });
});
