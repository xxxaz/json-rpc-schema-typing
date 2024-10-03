import { $Number, JsonRpcMethodDefinition } from '../../src/index.js';
export default JsonRpcMethodDefinition
    .paramsSchema(
        $Number
    )
    .define<unknown>(function(arg) {
        console.log(this, arg);
    });
