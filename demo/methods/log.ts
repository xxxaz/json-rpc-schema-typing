import { $Number, $Or, $String, JsonRpcMethodDefinition } from '../../src/index.js';
export default JsonRpcMethodDefinition.builder
    .paramsByPosition(
        $Or($Number, $String)
    )
    .define<unknown>(function(arg) {
        console.log(this, arg);
    });
