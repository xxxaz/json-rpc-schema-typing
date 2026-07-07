import { JsonRpcMethodDefinition } from '../../src/JsonRpcMethod.js';
import { $Number } from '../../src/schemas/Primitive.js';

export default {
    add: JsonRpcMethodDefinition.builder
        .paramsByPosition($Number, $Number)
        .return($Number)
        .define(async (a, b) => a + b),
} as const;
