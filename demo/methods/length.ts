import {
    $Array,
    $Integer,
    $Or,
    $String,
    JsonRpcMethodDefinition,
} from '../../src/index.js';

export default JsonRpcMethodDefinition.builder
    .paramsByPosition($Or($Array($String), $String))
    .return($Integer)
    .define<unknown>((array) => array.length);
