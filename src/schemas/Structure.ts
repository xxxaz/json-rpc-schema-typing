import { IsOptionalSchema, JSONSchema, Max, RequiredKeys } from "../types.js";
import { $Optional } from "./Complex.js";

export function $Array<T extends JSONSchema>(items: T) {
    return {
        type: 'array',
        items
    } as const;
}

export type ExcludeOptional<T extends any[]>
    = T extends [...infer A, infer L]
    ? IsOptionalSchema<L, ExcludeOptional<A>, T>
    : T;

export function $Tuple<T extends JSONSchema[]>(...items: T) {
    // NOTE: Optionalを含む場合、Ajvが以下のような通知を吐きます
    // strict mode: "items" is 2-tuple, but minItems or maxItems/additionalItems are not specified or different at path "#"
    const optionalNumber = [...items].reverse().findIndex((i: JSONSchema) => $Optional.is(i)) + 1;
    return {
        type: 'array',
        items: items as T,
        minItems: items.length - optionalNumber as ExcludeOptional<T>['length'],
        maxItems: items.length as Max<T['length']>,
        additionalItems: false,
    } as const;
}

type ObjectDefine = {
    [key: string]: JSONSchema;
};
export function $Object<T extends ObjectDefine>(properties: T) {
    const required = Object.entries(properties)
        .filter(([key, value]) => !$Optional.is(value))
        .map(([key]) => key) as [RequiredKeys<T>];
    return {
        type: 'object',
        additionalProperties: false,
        required,
        properties: properties as T
    } as const;
}
