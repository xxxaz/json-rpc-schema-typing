import {
    JsonRpcMethodDefinition,
    type JsonRpcMethodMeta,
    type Params,
    type Return,
} from '../src/JsonRpcMethod.js';
import { $Number, $String } from '../src/schemas/Primitive.js';

type Assert<T extends true> = T;
type Eq<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

const meta = {
    summary: 'カスタム質問取得',
    description: '物件のカスタム質問と配信設定を返す',
    tags: ['customQuestion', 'readonly'],
    result: { name: 'questions', description: '質問+配信設定' },
    params: { house_id: { description: '対象物件 ID' } },
    errors: [{ code: 40401, message: '物件が見つかりません' }],
    examples: [
        { name: '基本', params: { house_id: 1 }, result: { groups: [] } },
    ],
    deprecated: false,
} as const satisfies JsonRpcMethodMeta;

const withMeta = JsonRpcMethodDefinition.builder
    .meta(meta)
    .paramsByName({ house_id: $Number })
    .return($String)
    .define(async () => 'ok');

const withoutMeta = JsonRpcMethodDefinition.builder
    .paramsByName({ house_id: $Number })
    .return($String)
    .define(async () => 'ok');

describe('builder .meta()', () => {
    test('$meta として定義に保持される', () => {
        expect(withMeta.$meta).toEqual(meta);
        expect(withoutMeta.$meta).toBeUndefined();
    });

    test('.meta() をチェーンのどこに置いても保持される', () => {
        const metaLast = JsonRpcMethodDefinition.builder
            .paramsByName({ house_id: $Number })
            .return($String)
            .meta({ summary: '後置' })
            .define(async () => 'ok');
        expect(metaLast.$meta).toEqual({ summary: '後置' });
    });

    test('メタの有無は $params/$return と呼び出し型に影響しない', () => {
        expect(withMeta.$params).toEqual(withoutMeta.$params);
        expect(withMeta.$return).toEqual(withoutMeta.$return);

        // 型レベル: メタの有無で Params/Return が変わらない (コンパイル検証)
        type _ParamsUnaffected = Assert<
            Eq<
                Params<(typeof withMeta)['$params']>,
                Params<(typeof withoutMeta)['$params']>
            >
        >;
        type _ReturnUnaffected = Assert<
            Eq<
                Return<(typeof withMeta)['$return']>,
                Return<(typeof withoutMeta)['$return']>
            >
        >;
    });

    test('$apply の実行にも影響しない', async () => {
        await expect(withMeta.$apply({}, { house_id: 1 })).resolves.toBe('ok');
    });
});
