import { Ajv, ErrorObject } from 'ajv';
import { JsonRpcMethodSchema, Return } from "./JsonRpcMethod.js";
import { JSONSchema } from "./types.js";
import { InvalidParams, InvalidReturn } from './JsonRpcException.js';
import { FromSchema } from 'json-schema-to-ts';

function validate(data: unknown, schema: JSONSchema) {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate(data);
    return {
        valid,
        errors: [...serializeErrors(validate.errors)]
    };
}

type SerializedError = {
    propertyName?: string;
    message?: string;
    data?: any;
    keyword?: string;
    instancePath?: string;
    schemaPath?: string;
};

function * serializeErrors(error?: ErrorObject[]|null) : Generator<SerializedError> {
    if(!error) return;
    for(const { propertyName, message, schemaPath, data, keyword, instancePath, params } of error) {
        const err = {} as SerializedError;
        if(propertyName) err.propertyName = propertyName;
        if(message) err.message = message;
        if(data) err.data = data;
        if(keyword) err.keyword = keyword;
        if(instancePath) err.instancePath = instancePath;
        if(schemaPath) err.schemaPath = schemaPath;
        if (Object.keys(err).length > 0) {
            yield err;
        }
        if (params.errors) {
            yield * serializeErrors(params.errors);
        }
    }
}

type ParamType<Sch extends JsonRpcMethodSchema<any, any>> = Sch['$params'] extends object ? FromSchema<Sch['$params']> : undefined;
export class JsonRpcValidator<Sch extends JsonRpcMethodSchema<any, any>> {
    constructor(readonly schema: Sch) {
    }
    
    validateParams(params: unknown): params is ParamType<Sch> {
        if(!this.schema.$params) return params === undefined;
        const { errors } = validate(params, this.schema.$params);
        if(errors.length > 0) {
            const message = errors.map(({ instancePath, message }) => `params${instancePath ?? ''}: ${message}`).join('\n');
            throw new InvalidParams(message, errors);
        }
        return true;
    }

    validateReturn(result: unknown): result is Return<Sch['$return']> {
        if(!this.schema.$return) return result === undefined;
        const { errors } = validate(result as any, this.schema.$return);
        if (errors.length > 0) {
            const message = errors.map(({ instancePath, message }) => `return.${instancePath ?? ''}: ${message}`).join('\n');
            throw new InvalidReturn(message, errors);
        }
        return true;
    }

}