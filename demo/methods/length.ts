import { $Or, $String, JsonRpcMethodDefinition } from '../../src/index.js';
import { $Array, $Integer } from '../../src/index.js';

export default JsonRpcMethodDefinition
    .paramsSchema(
        $Or($Array($String), $String)
    )
    .returnSchema($Integer)
    .define<unknown>(function(array) {
        return array.length;
    });
