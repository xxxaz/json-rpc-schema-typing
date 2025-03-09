#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --loader=ts-node/esm

import { createServer } from 'http';
import { FileSystemRouter } from '../src/router/FileSystemRouter.js';
import { JsonRpcHttpReceiver } from '../src/server/JsonRpcHttpReceiver.js';
import { JsonRpcWebSocketReceiver } from '../src/server/JsonRpcWebSocketReceiver.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
import { WebSocketServer } from 'ws';


type Ctx = {};
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = new FileSystemRouter<Ctx>(resolve(__dirname, 'methods'));
const script = await router.schemaTypeScript();
writeFileSync(resolve(__dirname, 'schema.ts'), script);

const httpRpc = new JsonRpcHttpReceiver<Ctx>(router);
const wsRpc = new JsonRpcWebSocketReceiver<Ctx>(router);

const httpServer = createServer(async (request, response) => {
    httpRpc.serve({}, request, response);
});

const wsServer = new WebSocketServer({ server: httpServer });
wsServer.on('connection', (socket, request) => {
    const { url, headers } = request;
    const { pathname, searchParams } = new URL(url ?? '/', 'http://localhost');
    if (pathname === '/ws') {
        wsRpc.serve({}, socket);
    }

});

httpServer.listen(3000);