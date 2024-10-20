import { JsonRpcHttpClient } from '../src/client/JsonRpcHttpClient.js';
import schema, { hash } from './schema.js';

const rpcClient = new JsonRpcHttpClient({
    schema,
    postUrl: 'http://localhost:3000'
})
.lazy();

console.log(
    await Promise.all([
        rpcClient.log(hash),
        rpcClient.length(hash),
        rpcClient.subdir.slice(hash, 1, 3),
    ])
);