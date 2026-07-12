import { JsonRpcMethodDefinition } from '../src/JsonRpcMethod.js';
import {
    emitOpenRpcDocument,
    type OpenRpcMethod,
} from '../src/router/OpenRpc.js';
import { StaticRouter } from '../src/router/StaticRouter.js';
import { $Optional } from '../src/schemas/Complex.js';
import { $Boolean, $Number, $String } from '../src/schemas/Primitive.js';

const loadQuestions = JsonRpcMethodDefinition.builder
    .meta({
        summary: 'カスタム質問取得',
        description: '物件のカスタム質問と配信設定を返す',
        tags: ['customQuestion', 'readonly'],
        result: { name: 'questions', description: '質問+配信設定' },
        params: { house_id: { description: '対象物件 ID' } },
        errors: [{ code: 40401, message: '物件が見つかりません' }],
        examples: [
            { name: '基本', params: { house_id: 1 }, result: { groups: [] } },
        ],
    })
    .paramsByName({ house_id: $Number, include_hidden: $Optional($Boolean) })
    .return($String)
    .define(async () => 'ok');

const byPosition = JsonRpcMethodDefinition.builder
    .meta({
        params: {
            left: { description: '左辺' },
            right: { description: '右辺' },
        },
    })
    .paramsByPosition($Number, $Number)
    .return($Number)
    .define(async (left, right) => left + right);

const bare = JsonRpcMethodDefinition.builder
    .paramsByPosition($String)
    .return($String)
    .define(async (value) => value);

describe('OpenRPC emitter', () => {
    const router = new StaticRouter({
        customQuestion: {
            loadQuestions,
        },
        calc: {
            add: byPosition,
        },
        echo: bare,
    });

    const emit = () =>
        emitOpenRpcDocument(router, {
            info: { title: 'Host API', version: '1.0.0' },
            servers: [{ name: 'local', url: 'http://localhost/host-api' }],
            tags: [
                { name: 'readonly', description: '副作用の無い読み取り専用' },
            ],
        });

    test('Document 必須構造 (openrpc/info/methods) を満たす', async () => {
        const document = await emit();
        expect(document.openrpc).toBe('1.3.2');
        expect(document.info).toEqual({ title: 'Host API', version: '1.0.0' });
        expect(Array.isArray(document.methods)).toBe(true);
        expect(document.methods).toHaveLength(3);
        expect(document.servers).toEqual([
            { name: 'local', url: 'http://localhost/host-api' },
        ]);
    });

    test('method.name はメソッドパス', async () => {
        const document = await emit();
        const names = document.methods.map(({ name }) => name);
        expect(names).toEqual([
            'customQuestion.loadQuestions',
            'calc.add',
            'echo',
        ]);
    });

    test('paramStructure は $params の型から自動導出される', async () => {
        const document = await emit();
        const byName = document.methods.find(
            ({ name }) => name === 'customQuestion.loadQuestions',
        ) as OpenRpcMethod;
        const byPos = document.methods.find(
            ({ name }) => name === 'calc.add',
        ) as OpenRpcMethod;
        expect(byName.paramStructure).toBe('by-name');
        expect(byPos.paramStructure).toBe('by-position');
    });

    test('by-name params は $Object の properties/required から名前付き Content Descriptor になる', async () => {
        const document = await emit();
        const method = document.methods.find(
            ({ name }) => name === 'customQuestion.loadQuestions',
        ) as OpenRpcMethod;
        expect(method.params).toEqual([
            {
                name: 'house_id',
                schema: $Number,
                required: true,
                description: '対象物件 ID',
            },
            { name: 'include_hidden', schema: expect.anything() },
        ]);
    });

    test('by-position params は $meta.params のキー順で命名される (無ければ param{N})', async () => {
        const document = await emit();
        const withNames = document.methods.find(
            ({ name }) => name === 'calc.add',
        ) as OpenRpcMethod;
        expect(withNames.params.map(({ name }) => name)).toEqual([
            'left',
            'right',
        ]);
        expect(withNames.params.every(({ required }) => required)).toBe(true);

        const anonymous = document.methods.find(
            ({ name }) => name === 'echo',
        ) as OpenRpcMethod;
        expect(anonymous.params.map(({ name }) => name)).toEqual(['param0']);
    });

    test('result は name 必須 (meta 未指定なら <method>Result を合成)', async () => {
        const document = await emit();
        const withMeta = document.methods.find(
            ({ name }) => name === 'customQuestion.loadQuestions',
        ) as OpenRpcMethod;
        expect(withMeta.result).toEqual({
            name: 'questions',
            description: '質問+配信設定',
            schema: $String,
        });

        const synthesized = document.methods.find(
            ({ name }) => name === 'calc.add',
        ) as OpenRpcMethod;
        expect(synthesized.result.name).toBe('addResult');
        expect(synthesized.result.schema).toEqual($Number);
    });

    test('meta の summary/description/tags/errors/examples が反映される', async () => {
        const document = await emit();
        const method = document.methods.find(
            ({ name }) => name === 'customQuestion.loadQuestions',
        ) as OpenRpcMethod;
        expect(method.summary).toBe('カスタム質問取得');
        expect(method.description).toBe('物件のカスタム質問と配信設定を返す');
        // グローバル定義がある tag は $ref、無い tag は名前のみ
        expect(method.tags).toEqual([
            { name: 'customQuestion' },
            { $ref: '#/components/tags/readonly' },
        ]);
        expect(method.errors).toEqual([
            { code: 40401, message: '物件が見つかりません' },
        ]);
        expect(method.examples).toEqual([
            {
                name: '基本',
                params: [{ name: 'house_id', value: 1 }],
                result: { name: 'questions', value: { groups: [] } },
            },
        ]);
        expect(document.components?.tags?.readonly).toEqual({
            name: 'readonly',
            description: '副作用の無い読み取り専用',
        });
    });
});
