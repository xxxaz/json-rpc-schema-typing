import { Ajv } from 'ajv';
import { JsonRpcMethodSchema, Params, Return } from "./JsonRpcMethod.js";
import { JSONSchema } from "./types.js";
import { InvalidParams, InvalidReturn } from './JsonRpcException.js';
import { $Optional } from './schemas/Structure.js';

function validate(data: unknown, schema: JSONSchema) {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(data);
    return {
        valid,
        errors: validate.errors ?? []
    };
}

export class JsonRpcValidator<Sch extends JsonRpcMethodSchema<any, any>> {
    constructor(readonly schema: Sch) {
    }

    get #params() : readonly JSONSchema[] {
        return this.schema.$params;
    }

    get #return() : JSONSchema {
        return this.schema.$return;
    }
    
    validateParams(params: unknown[]): params is Params<Sch['$params']> {
        const shorten = this.#params.slice(params.length).every($Optional.is);
        const schema = shorten ? this.#params.slice(0, params.length) : this.#params;

        const errors = schema
            .map((schema, index) => validate(params[index] as any, schema))
            .map(({ errors }, argument) => errors.map(({ propertyName, message }) => ({ argument, property: propertyName ?? '', message: message ?? '' })))
            .flat();
        if(errors.length > 0) {
            const message = errors.map(({ argument, property, message }) => `args[${argument}].${property}: ${message}`).join('\n');
            throw new InvalidParams(message, errors);
        }
        return true;
    }

    validateReturn(result: unknown): result is Return<Sch['$return']> {
        if(!this.schema.$return) return result === undefined;
        const errors = validate(result as any, this.#return).errors.map(({ propertyName, message }) => ({ property: propertyName ?? '', message: message ?? '' }));
        if (errors.length > 0) {
            const message = errors.map(({ property, message }) => `return.${property}: ${message}`).join('\n');
            throw new InvalidReturn(message, errors);
        }
        return true;
    }

}