import { JsonRpcMethodDefinition } from '../src/JsonRpcMethod.js';
import { LazyRouter, StaticRouter } from '../src/router/StaticRouter.js';
import { $String } from '../src/schemas/Primitive.js';

const direct = JsonRpcMethodDefinition.builder
    .paramsByName({ value: $String })
    .return($String)
    .define(async ({ value }) => value.toUpperCase());

describe('StaticRouter', () => {
    test('既存エントリ (値/Promise/nested) の後方互換', async () => {
        const router = new StaticRouter({
            direct,
            promised: Promise.resolve(direct),
            nested: {
                child: direct,
            },
        });

        expect(await router.resolve('direct')).toBe(direct);
        expect(await router.resolve('promised')).toBe(direct);
        expect(await router.resolve('nested.child')).toBe(direct);
        expect(await router.resolve('unknown')).toBeNull();
    });

    test('lazy thunk: () => import() エントリの解決と .default unwrap', async () => {
        const router = new StaticRouter({
            lazy: {
                method: () => import('./fixtures/lazyMethod.js'),
            },
        });

        const resolved = await router.resolve('lazy.method');
        expect(JsonRpcMethodDefinition.isDefinition(resolved)).toBe(true);
        const definition = resolved as JsonRpcMethodDefinition<any, any, any>;
        await expect(definition.$apply({}, { name: 'world' })).resolves.toBe(
            'hello world',
        );
    });

    test('lazy thunk: default export が RouteMap のモジュールも unwrap して辿れる', async () => {
        const router = new StaticRouter({
            calc: () => import('./fixtures/lazyRoutes.js'),
        });

        const resolved = await router.resolve('calc.add');
        expect(JsonRpcMethodDefinition.isDefinition(resolved)).toBe(true);
        const definition = resolved as JsonRpcMethodDefinition<any, any, any>;
        await expect(definition.$apply({}, [1, 2])).resolves.toBe(3);
    });

    test('lazy thunk: default を持たない解決値 (定義そのもの/生の RouteMap) も扱える', async () => {
        const router = new StaticRouter({
            thunkDef: async () => direct,
            thunkMap: async () => ({ inner: direct }),
        });

        expect(await router.resolve('thunkDef')).toBe(direct);
        expect(await router.resolve('thunkMap.inner')).toBe(direct);
    });

    test('thunk の解決は一度だけ実行されキャッシュされる', async () => {
        let called = 0;
        const router = new StaticRouter({
            counted: async () => {
                called++;
                return direct;
            },
        });

        await router.resolve('counted');
        await router.resolve('counted');
        expect(called).toBe(1);
        expect(await router.resolve('counted')).toBe(direct);
    });

    test('schema() が lazy エントリ込みで $params/$return を収集する', async () => {
        const router = new StaticRouter({
            lazy: {
                method: () => import('./fixtures/lazyMethod.js'),
            },
            direct,
        });

        const schema = (await router.schema()) as any;
        expect(schema.direct.$params).toEqual(direct.$params);
        expect(schema.direct.$return).toEqual(direct.$return);
        expect(schema.lazy.method.$params.properties.name).toEqual($String);
    });

    test('LazyRouter は StaticRouter への alias', () => {
        expect(LazyRouter).toBe(StaticRouter);
    });
});
