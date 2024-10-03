import { JSONSchema } from "../types.js";

export function $Array<T extends JSONSchema>(items: T) {
    return {
        type: 'array',
        items
    } as const;
}

export function $Tuple<T extends JSONSchema[]>(...items: T) {
    return {
        type: 'array',
        items,
        minItems: items.length as T['length'],
        maxItems: items.length as T['length'],
    } as const;
}

type ObjectDefine = {
    [key: string]: JSONSchema;
};
export function $Object<T extends ObjectDefine>(properties: T) {
    return {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(properties) as [keyof T],
        properties
    } as const;
}
