import {
    $Array,
    $Integer,
    $Or,
    $String,
    JsonRpcMethodDefinition,
} from '../../../src/index.js';

export default JsonRpcMethodDefinition.builder
    .paramsByPosition($Or($Array($String), $String), $Integer, $Integer)
    .return($String)
    .define<unknown>((array, start, end) => {
        const sliced = array.slice(start, end);
        return Array.isArray(sliced) ? sliced.join('') : sliced;
    });
