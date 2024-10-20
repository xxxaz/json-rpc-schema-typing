import { Primitive } from "@xxxaz/stream-api-json";
import { JSONSchema } from "../types.js";

export function $Enum<T extends (null|boolean|number|string)[]>(...elements: T) {
    return {
        enum: elements
    } as const;
}

export function $EnumKeys<T extends object>(obj: T) {
    return {
        enum: Object.keys(obj) as [(keyof T)]
    } as const;
}

export function $EnumValues<T extends { [key: string]: Primitive }>(obj: T) {
    return {
        enum: Object.values(obj) as [T[keyof T]],
    } as const;
};

export function $Expand<Src extends JSONSchema, Ex extends Partial<JSONSchema>>(source: Src, expand: Ex) {
    return {
        ...source,
        ...expand,
    } as const;
}

export function $And<Schemas extends JSONSchema[]>(...allOf: Schemas) {
    return {
        allOf
    } as const;
}

export function $Or<Schemas extends JSONSchema[]>(...anyOf: Schemas) {
    return {
        anyOf
    } as const;
}

export function $Xor<Schemas extends JSONSchema[]>(...oneOf: Schemas) {
    return {
        oneOf
    } as const;
}
