import { FromSchema as ToTsFromSchema, type JSONSchema as ToTsSchema } from 'json-schema-to-ts';
import { type JsonSerializable } from "@xxxaz/stream-api-json";

export type TupleSchema<T extends JSONSchema[]> = {
    type: 'array';
    items: T;
    minItems: number;
    maxItems: number;
};

export type IsOptionalSchema<Sch, T, F> = false extends (Sch extends { oneOf: readonly ToTsSchema[] } ? Sch['oneOf'][number] : never) ? T : F;
type FromTuples<Schemas> = 
    Schemas extends [infer Head extends JSONSchema, ...infer Tail]
        ? (
            IsOptionalSchema<Head,
                [t?: ToTsFromSchema<Head>, ...FromTuples<Tail>],
                [ToTsFromSchema<Head>, ...FromTuples<Tail>]
            >
        ) : [];

export type FromSchema<T extends JSONSchema>
= (
    T extends TupleSchema<infer U>
        ? FromTuples<U>
        : ToTsFromSchema<T>
) | IsOptionalSchema<T,  undefined, never>;

export type JSONSchema = ToTsSchema & object;

export type JsonRpcRequest = {
    jsonrpc: '2.0';
    id?: number|string;
    method: string;
    params: any;
};


export type JsonRpcError = Readonly<{
    code: number;
    message?: string;
    data?: JsonSerializable;
}>;


export type JsonRpcResponse<Result extends JsonSerializable> = {
    readonly jsonrpc: '2.0';
    readonly id: number|string;
    readonly result: Result;
}|{
    readonly jsonrpc: '2.0';
    readonly id: number|string|null;
    readonly error: JsonRpcError;
};


export type MessageListener = (ev: MessageEvent) => void;
export type MessageInput = {
    addEventListener(type: 'message', listener: MessageListener): void;
    removeEventListener(type: 'message', listener: MessageListener): void;
};
export type MessageOutput = {
    postMessage(message: any): void;
};

type FitMin<N extends number, C extends void[] = []> = C['length'] extends N ? C : FitMin<N, [void, ...C]>;
type FitMax<N extends number, C extends void[] = FitMin<N>> = [void, ...C]['length'] extends N ? FitMax<N, [void, ...C]> : C;

export type Min<NumLiteral extends number> = FitMin<NumLiteral> extends any[] ? FitMin<NumLiteral>['length']: never;
export type Max<NumLiteral extends number> = FitMax<NumLiteral> extends any[] ? FitMax<NumLiteral>['length'] : never;

export type IsOptional<A, T, F = never> = A|undefined extends A ? T : F;
export type IsNever<A, T, F = never> = [A] extends [never] ? T : F;
export type PerfectMatch<A, B, T, F = never> = [A] extends [B] ? ([B] extends [A] ? T : F) : F;

export type OptionalKeys<T> = Exclude<{ [K in keyof T]: IsOptional<T[K], K, never> }[keyof T], undefined>;
export type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>;

declare const InvalidRef: unique symbol;
export type InvalidRef<Msg> = Omit<Msg&[never], keyof Msg|keyof [never]>;
