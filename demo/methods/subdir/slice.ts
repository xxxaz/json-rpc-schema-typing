import { $Or, $String, JsonRpcMethodDefinition } from '../../../src/index.js';
import { $Array, $Integer } from '../../../src/index.js';

export default JsonRpcMethodDefinition.builder
    .paramsByPosition(
        $Or($Array($String), $String),
        $Integer,
        $Integer
    )
    .return($String)
    .define<unknown>(function(array, start, end) {
        const sliced = array.slice(start, end);
        return sliced instanceof Array
            ? sliced.join('')
            : sliced;
    });
