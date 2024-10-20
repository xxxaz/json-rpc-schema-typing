import { JSONSchema } from "../types.js";

export function $Optional<T extends JSONSchema>(item: T) {
    return {
        ...item,
        optional: true
    } as const;
}

export function $Array<T extends JSONSchema>(items: T) {
    return {
        type: 'array',
        items
    } as const;
}

type RequiredLength<T extends any[]> = T extends [...infer A, { optional: true }] ? RequiredLength<A> : T['length'];

export function $Tuple<T extends JSONSchema[]>(...items: T) {
    return {
        type: 'array',
        items,
        minItems: items.length as RequiredLength<T>,
        maxItems: items.length as T['length'],
    } as const;
}

type ObjectDefine = {
    [key: string]: JSONSchema;
};

type RequiredKeys<T extends ObjectDefine> = {
    [K in keyof T]: T[K] extends { optional: true } ? never : K;
}[keyof T];

export function $Object<T extends ObjectDefine>(properties: T) {
    return {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(properties) as [RequiredKeys<T>],
        properties
    } as const;
}
