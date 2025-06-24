#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --loader=ts-node/esm

import { JsonRpcHttpClient } from '../src/client/JsonRpcHttpClient.js';
import { JsonRpcHttp2Client } from '../src/client/JsonRpcHttp2Client.js';
import { JsonRpcWebSocketClient } from '../src/client/JsonRpcWebSocketClient.js';
import schema, { hash } from './schema.js';

const rpcHttpClient = new JsonRpcHttpClient({
    schema,
    postUrl: 'http://localhost:3000'
});

const rpcHttp2Client = new JsonRpcHttp2Client({
    schema,
    postUrl: 'http://localhost:3001'
});

const ws = new WebSocket('ws://localhost:3000/ws?s=cccc');
ws.addEventListener('message', ({ data })=>console.log('message', data));
await new Promise(resolve=>ws.onopen = resolve);

const rpcSocketClient = new JsonRpcWebSocketClient({
    schema,
    socket: ws
});


const rpcClient = rpcHttp2Client.lazy();

console.log(
    await Promise.all([
        rpcClient.log(hash),
        rpcClient.length(hash),
        rpcClient.subdir.slice(hash, 1, 3),
    ])
);
