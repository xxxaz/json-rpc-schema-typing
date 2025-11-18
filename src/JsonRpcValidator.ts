import { FromSchema } from 'json-schema-to-ts';
import { JsonRpcMethodSchema, ParameterSchema } from "./JsonRpcMethod.js";
import { JSONSchema } from "./types.js";
import { InvalidParams, InvalidReturn } from './JsonRpcException.js';
import { JsonSchemaValidator } from './JsonSchemaValidator.js';

type Valid<S> = S extends JSONSchema ? FromSchema<S> : never;

export class JsonRpcValidator<
    P extends ParameterSchema,
    R extends JSONSchema | undefined,
    Sch extends JsonRpcMethodSchema<P, R>
> {
    constructor(readonly schema: Sch) {
        this.#paramValidator = schema.$params ? new JsonSchemaValidator(schema.$params): null;
        this.#returnValidator = schema.$return ? new JsonSchemaValidator(schema.$return) : null;
    }
    #paramValidator:JsonSchemaValidator | null;
    #returnValidator:JsonSchemaValidator | null;

    validateParams(params: unknown): Valid<Sch['$params']> {
        if(!this.#paramValidator) return params as Valid<Sch['$params']>;
        const validated = this.#paramValidator.validate(params);
        if(!validated.valid && validated.errors.length > 0) {
            const message = validated.errors.map(({ instancePath, message }) => `params${instancePath ?? ''}: ${message}`).join('\n');
            throw new InvalidParams(message, validated.errors);
        }
        return params as Valid<Sch['$params']>;
    }

    validateReturn(result: unknown): Valid<Sch['$return']> {
        if(!this.#returnValidator) return result as Valid<Sch['$return']>;
        const validated = this.#returnValidator.validate(result);
        if (!validated.valid && validated.errors.length > 0) {
            const message = validated.errors.map(({ instancePath, message }) => `return.${instancePath ?? ''}: ${message}`).join('\n');
            throw new InvalidReturn(message, validated.errors);
        }
        return result as Valid<Sch['$return']>;
    }

}