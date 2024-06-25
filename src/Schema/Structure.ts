import { JSONSchema } from "../types.js";

export function $Array<T extends JSONSchema>(items: T) {
    return {
        type: 'array',
        items,
        additionalItems: false
    } as const;
}

export function $Tuple<T extends JSONSchema[]>(...items: T) {
    return {
        type: 'array',
        prefixItems: items,
        items: false,
        additionalItems: false
    } as const;
}

function isSchema(obj: any) : obj is JSONSchema {
    return (typeof obj?.type) === 'string';
}

type ObjectDefine = {
    [key: string]: ObjectDefine|JSONSchema;
};
type ObjectSchema<T extends ObjectDefine> = {
    type: 'object';
    additionalProperties: false;
    required: (keyof T)[];
    properties: ObjectProperties<T>;
};
type ObjectProperties<T extends ObjectDefine> = {
    [K in keyof T]: T[K] extends ObjectDefine ? ObjectSchema<T[K]> : T[K]
};
export function $Object<T extends ObjectDefine>(define: T): ObjectSchema<T> {
    const properties = Object.fromEntries(
        Object.entries(define).map(([k, v]) => {
            const schema = isSchema(v) ? v : $Object(v);
            return [k, schema] as const;
        })
    ) as ObjectProperties<T>;

    return {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(define),
        properties
    };
}
