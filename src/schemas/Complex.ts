import { type Primitive } from "@xxxaz/stream-api-json";
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

type Optional<T> = { oneOf: (T|false)[] } | { anyOf: (T|false)[] };
export function $Optional<T extends JSONSchema>(item: T) {
    return {
        oneOf: [item, false]
    } as const;
}

$Optional.is = (item: unknown): item is Optional<any> => {
    const lits = (item as any)?.oneOf ?? (item as any)?.anyOf ?? null;
    if (!lits) return false;
    return (lits.some((i: any) => i === false));
};

type Unwrapped<T> = T extends Optional<infer U> ? U : T;
$Optional.unwrap = <T extends JSONSchema|undefined>(item: T): Unwrapped<T> => {
    const optionalList = item?.oneOf ?? item?.anyOf ?? null;
    if (!optionalList) return item as Unwrapped<T>;
    const list = optionalList.filter(i => i !== false);
    if (list.length === 1) return list[0] as Unwrapped<T>;
    return item?.oneOf
        ? { oneOf: list } as Unwrapped<T>
        : { anyOf: list } as Unwrapped<T>;
};

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

export function $Omit<
    T extends JSONSchema & { type: 'object' },
    K extends keyof T['properties'] & string,
>(schema: T, keys: readonly K[]) {
    const properties = Object.fromEntries(
        Object.entries(schema.properties ?? {}).filter(
            ([key]) => !keys.includes(key as K)
        )
    );
    const required = (schema.required ?? []).filter(
        (k) => !keys.includes(k as K)
    );
    return {
        type: 'object',
        properties: properties as Omit<T['properties'], K>,
        required: required as T['required'] extends (infer R)[]
            ? [Exclude<R, K>]
            : never,
        additionalProperties:
            schema.additionalProperties as T['additionalProperties'],
    } as const;
}
