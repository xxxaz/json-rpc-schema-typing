import { IsOptional, JSONSchema, Max, RequiredKeys } from "../types.js";

export function $Optional<T extends JSONSchema>(item: T) {
    return item as T|undefined;
}

export function $Array<T extends JSONSchema>(items: T) {
    return {
        type: 'array',
        items
    } as const;
}

type ExcludeUndefined<T extends any[]> = T extends [...infer A, infer L] ? IsOptional<L, ExcludeUndefined<A>, T> : T;
type RequiredLength<T extends any[]> = ExcludeUndefined<[...T, undefined]>['length'];
export function $Tuple<T extends JSONSchema[]>(...items: T) {
    return {
        type: 'array',
        items,
        minItems: items.length as RequiredLength<T>,
        maxItems: items.length as Max<T['length']>,
    } as const;
}

type ObjectDefine = {
    [key: string]: JSONSchema|undefined;
};
type Properties<T extends ObjectDefine> = {
    [K in keyof T]: Exclude<T[K], undefined>;
}
export function $Object<T extends ObjectDefine>(properties: T) {
    return {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(properties) as [RequiredKeys<T>],
        properties: properties as Properties<T>
    } as const;
}
