import { JsonRpcMethodDefinition } from '../../src/JsonRpcMethod.js';
import { $String } from '../../src/schemas/Primitive.js';

export default JsonRpcMethodDefinition.builder
    .paramsByName({ name: $String })
    .return($String)
    .define(async ({ name }) => `hello ${name}`);
