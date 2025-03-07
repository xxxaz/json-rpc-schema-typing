import { $Or, $String, JsonRpcMethodDefinition } from '../../src/index.js';
import { $Array, $Integer } from '../../src/index.js';

export default JsonRpcMethodDefinition.builder
    .paramsByPosition(
        $Or($Array($String), $String)
    )
    .return($Integer)
    .define<unknown>(function(array) {
        return array.length;
    });
