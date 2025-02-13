import { IsOptional, JSONSchema, Max, RequiredKeys } from "../types.js";


const $optionalKey = Symbol('$Optional');
type OSchema = JSONSchema & { [$optionalKey]?: true };
export function $Optional<T extends JSONSchema>(item: T) {
    return {
        ...item,
        [$optionalKey]: true
    } as T|undefined;
}
$Optional.key = $optionalKey;
$Optional.is = (item: JSONSchema|undefined): item is OSchema => {
    return Boolean(item && (item as OSchema)[$optionalKey] === true);
};

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
        minItems: items.lastIndexOf((i: OSchema) => !$Optional.is(i)) + 1 as RequiredLength<T>,
        maxItems: items.length as Max<T['length']>,
    } as const;
}

type ObjectDefine = {
    [key: string]: OSchema|undefined;
};
type Properties<T extends ObjectDefine> = {
    [K in keyof T]: Exclude<T[K], undefined>;
}
export function $Object<T extends ObjectDefine>(properties: T) {
    const required = Object.entries(properties)
        .filter(([key, value]) => !$Optional.is(value))
        .map(([key]) => key) as [RequiredKeys<T>];
    return {
        type: 'object',
        additionalProperties: false,
        required,
        properties: properties as Properties<T>
    } as const;
}
