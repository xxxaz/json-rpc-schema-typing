import { type JsonSerializable } from "@xxxaz/stream-api-json";
import { JsonRpcError } from "./types.js";
import * as InitialDefinedErros from './JsonRpcException.js';

type JsonRpcExceptionClass = {
    readonly defaultMessage?: string;
    readonly code: number;
    new(message?: string, data?: JsonSerializable): JsonRpcException;
};

export abstract class JsonRpcException extends Error {
    static #defined: Map<JsonRpcExceptionClass, string> = new Map();
    static defineExceptions(classes: { [name: string]: object }) {
        Object.entries(classes).forEach(([ name, cls ])=> {
            if(!JsonRpcException.isPrototypeOf(cls)) return;
            const ex = cls as JsonRpcExceptionClass;
            if(!this.#defined.has(ex) && ex.code) {
                this.#defined.set(ex, name);
            }
        });
    }

    static deserialize(error: JsonRpcError): JsonRpcException {
        const { code, message, data } = error;
        for(const cls of this.#defined.keys()) {
            if(cls.code !== code) continue;
            return new cls(message, data);
        }
        return new ResponseUncaughtError(error);
    }

    constructor(message?: string, data?: JsonSerializable) {
        if(!message) message = (new.target as any).defaultMessage;
        super(message);
        this.data = data;
    }

    readonly data?: JsonSerializable;

    get name(): string {
        return JsonRpcException.#defined.get(this.constructor as JsonRpcExceptionClass)
            ?? this.constructor.name;
    }

    get code(): number {
        return (this.constructor as JsonRpcExceptionClass).code;
    }

    serialize(): JsonRpcError {
        return {
            code: this.code,
            message: this.message,
            data: this.data,
        };
    }

    toJSON() {
        return this.serialize();
    }

}

export class ParseError extends JsonRpcException {
    static readonly code = -32700;
    static readonly defaultMessage = 'Invalid JSON was received by the server.';
}

export class InvalidRequest extends JsonRpcException {
    static readonly code = -32600;
    static readonly defaultMessage = 'The JSON sent is not a valid Request object.';
}

export class MethodNotFound extends JsonRpcException {
    static readonly code = -32601;
    static readonly defaultMessage = 'The method does not exist / is not available.';
}

export class InvalidParams extends JsonRpcException {
    static readonly code = -32602;
    static readonly defaultMessage = 'Invalid method parameter(s)';
}

export class InternalError extends JsonRpcException {
    static readonly code = -32603;
    static readonly defaultMessage = 'Internal JSON-RPC error.';
}

export class InvalidContext extends InternalError {
}

export class InvalidReturn extends InternalError {
}


/**
 * 
 * @property {number} code define to between -32000 to -32099
 */
export abstract class ServerError extends JsonRpcException {
    static define(classes: { [name: string]: JsonRpcExceptionClass }) {
        Object.entries(classes).forEach(([name, cls])=>{
            if(!ServerError.prototype.isPrototypeOf(cls)) {
                throw new Error(`${name} is not extends by ServerError`);
            }
            if(cls.code < -32099 || -32000 < cls.code) {
                throw new Error(`Defined ServerError code must be between -32000 to -32099 (${name} ${cls.code})`);
            }
        });
        JsonRpcException.defineExceptions(classes);
    }
}

export class ResponseUncaughtError extends JsonRpcException {
    constructor(readonly error: JsonRpcError) {
        super(error.message ?? 'Uncaught Error', error.data);
    }
}

export class ClientUncaughtError extends JsonRpcException {
    constructor(message: string, data?: JsonSerializable) {
        super(message, data);
    }
}
export class ClientHttpError extends JsonRpcException {
    constructor(message: string, data?: JsonSerializable) {
        super(message, data);
    }
}
export class WebSocketConnectionError extends JsonRpcException {
    constructor(message: string, data?: JsonSerializable) {
        super(message, data);
    }
}

JsonRpcException.defineExceptions(InitialDefinedErros);