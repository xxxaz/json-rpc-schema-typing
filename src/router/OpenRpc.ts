import type {
    JsonRpcErrorMeta,
    JsonRpcExternalDocsMeta,
    JsonRpcMethodDefinition,
} from '../JsonRpcMethod.js';
import type { JSONSchema } from '../types.js';
import { JsonRpcRouter } from './JsonRpcRouter.js';

/**
 * OpenRPC Specification (https://spec.open-rpc.org/) に基づく Document 構造 (利用フィールドの部分集合)。
 */
export type OpenRpcInfo = {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: { name?: string; url?: string; email?: string };
    license?: { name: string; url?: string };
};
export type OpenRpcServer = {
    name: string;
    url: string;
    summary?: string;
    description?: string;
};
export type OpenRpcTag = {
    name: string;
    summary?: string;
    description?: string;
    externalDocs?: JsonRpcExternalDocsMeta;
};
export type OpenRpcContentDescriptor = {
    name: string;
    summary?: string;
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema: JSONSchema;
};
export type OpenRpcExample = {
    name?: string;
    summary?: string;
    description?: string;
    value: unknown;
};
export type OpenRpcExamplePairing = {
    name: string;
    summary?: string;
    description?: string;
    params: OpenRpcExample[];
    result?: OpenRpcExample;
};
export type OpenRpcMethod = {
    name: string;
    summary?: string;
    description?: string;
    tags?: ({ name: string } | { $ref: string })[];
    paramStructure?: 'by-name' | 'by-position' | 'either';
    params: OpenRpcContentDescriptor[];
    result: OpenRpcContentDescriptor;
    errors?: JsonRpcErrorMeta[];
    examples?: OpenRpcExamplePairing[];
    deprecated?: boolean;
    externalDocs?: JsonRpcExternalDocsMeta;
};
export type OpenRpcDocument = {
    openrpc: string;
    info: OpenRpcInfo;
    servers?: OpenRpcServer[];
    methods: OpenRpcMethod[];
    components?: { tags?: Record<string, OpenRpcTag> };
    externalDocs?: JsonRpcExternalDocsMeta;
};

/**
 * document-level の情報は per-method メタでは埋まらないため、
 * API サーフェス単位の設定として emitter 引数で受け取る。
 */
export type OpenRpcEmitOptions = {
    /** OpenRPC 仕様バージョン (既定: 1.3.2) */
    openrpc?: string;
    info: OpenRpcInfo;
    servers?: OpenRpcServer[];
    /** グローバル Tag 定義。method.tags の名前が一致するものは components.tags への $ref になる */
    tags?: OpenRpcTag[];
    externalDocs?: JsonRpcExternalDocsMeta;
};

/**
 * router を全解決し、各メソッド定義の $params/$return/$meta から OpenRPC Document を生成する。
 * - method.name はメソッドパス (`call.list` 等) から自動導出
 * - paramStructure は $params の型 (object → by-name / array → by-position) から自動導出
 * - result は name 必須のため、$meta.result.name 未指定時は `<メソッド名>Result` を合成
 */
export async function emitOpenRpcDocument(
    router: JsonRpcRouter<any>,
    options: OpenRpcEmitOptions,
): Promise<OpenRpcDocument> {
    const globalTags = new Set((options.tags ?? []).map(({ name }) => name));
    const methods: OpenRpcMethod[] = [];
    await collectMethods(router, [], globalTags, methods);

    const document: OpenRpcDocument = {
        openrpc: options.openrpc ?? '1.3.2',
        info: options.info,
        methods,
    };
    if (options.servers?.length) document.servers = [...options.servers];
    if (options.tags?.length) {
        document.components = {
            tags: Object.fromEntries(
                options.tags.map((tag) => [tag.name, tag]),
            ),
        };
    }
    if (options.externalDocs) document.externalDocs = options.externalDocs;
    return document;
}

async function collectMethods(
    router: JsonRpcRouter<any>,
    path: string[],
    globalTags: Set<string>,
    methods: OpenRpcMethod[],
) {
    for await (const key of router.enumerate()) {
        const child = await router.resolveChild(key);
        if (!child) continue;
        const childPath = [...path, key];
        if (child instanceof JsonRpcRouter) {
            await collectMethods(child, childPath, globalTags, methods);
            continue;
        }
        methods.push(buildMethod(child, childPath, globalTags));
    }
}

function buildMethod(
    definition: JsonRpcMethodDefinition<any, any, any>,
    path: string[],
    globalTags: Set<string>,
): OpenRpcMethod {
    const meta = definition.$meta ?? {};
    const methodName = path[path.length - 1];
    const { paramStructure, params } = buildParams(definition);

    const method: OpenRpcMethod = {
        name: path.join('.'),
        params,
        result: {
            name: meta.result?.name ?? `${methodName}Result`,
            ...(meta.result?.summary != null
                ? { summary: meta.result.summary }
                : {}),
            ...(meta.result?.description != null
                ? { description: meta.result.description }
                : {}),
            schema: (definition.$return ?? {}) as JSONSchema,
        },
    };
    if (paramStructure) method.paramStructure = paramStructure;
    if (meta.summary != null) method.summary = meta.summary;
    if (meta.description != null) method.description = meta.description;
    if (meta.tags?.length) {
        method.tags = meta.tags.map((name) =>
            globalTags.has(name)
                ? { $ref: `#/components/tags/${name}` }
                : { name },
        );
    }
    if (meta.errors?.length) method.errors = [...meta.errors];
    if (meta.examples?.length) {
        method.examples = meta.examples.map((example) => {
            const pairing: OpenRpcExamplePairing = {
                name: example.name,
                params: Array.isArray(example.params)
                    ? example.params.map((value, index) => ({
                          name: params[index]?.name ?? `param${index}`,
                          value,
                      }))
                    : Object.entries(example.params).map(([name, value]) => ({
                          name,
                          value,
                      })),
            };
            if (example.summary != null) pairing.summary = example.summary;
            if (example.description != null)
                pairing.description = example.description;
            if (example.result !== undefined)
                pairing.result = {
                    name: method.result.name,
                    value: example.result,
                };
            return pairing;
        });
    }
    if (meta.deprecated != null) method.deprecated = meta.deprecated;
    if (meta.externalDocs) method.externalDocs = meta.externalDocs;
    return method;
}

function buildParams(
    definition: JsonRpcMethodDefinition<any, any, any>,
): Pick<OpenRpcMethod, 'paramStructure' | 'params'> {
    const { $params, $meta } = definition;
    const paramsMeta = $meta?.params ?? {};

    if ($params?.type === 'object') {
        const required =
            ($params as { required?: readonly string[] }).required ?? [];
        const params = Object.entries($params.properties ?? {}).map(
            ([name, schema]) =>
                contentDescriptor(
                    name,
                    schema as JSONSchema,
                    required.includes(name),
                    paramsMeta[name],
                ),
        );
        return { paramStructure: 'by-name', params };
    }

    if ($params?.type === 'array') {
        // $Tuple は名前を持たないため、$meta.params のキー記述順を位置に対応させる (無ければ param{N} を合成)
        const names = Object.keys(paramsMeta);
        const items = ($params.items ?? []) as readonly JSONSchema[];
        const minItems =
            ($params as { minItems?: number }).minItems ?? items.length;
        const params = items.map((schema, index) => {
            const name = names[index] ?? `param${index}`;
            return contentDescriptor(
                name,
                schema,
                index < minItems,
                paramsMeta[name],
            );
        });
        return { paramStructure: 'by-position', params };
    }

    return { params: [] };
}

function contentDescriptor(
    name: string,
    schema: JSONSchema,
    required: boolean,
    meta?: {
        summary?: string;
        description?: string;
        required?: boolean;
        deprecated?: boolean;
    },
): OpenRpcContentDescriptor {
    const descriptor: OpenRpcContentDescriptor = { name, schema };
    const isRequired = meta?.required ?? required;
    if (isRequired) descriptor.required = true;
    if (meta?.summary != null) descriptor.summary = meta.summary;
    if (meta?.description != null) descriptor.description = meta.description;
    if (meta?.deprecated != null) descriptor.deprecated = meta.deprecated;
    return descriptor;
}
