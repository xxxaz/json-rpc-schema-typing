import { type JSONSchema as ToTsSchema } from 'json-schema-to-ts';
import { type JsonSerializable } from "@xxxaz/stream-api-json";

export type JSONSchema = ToTsSchema & object & { optional?: boolean };

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
