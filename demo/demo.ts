import { createServer, IncomingMessage, ServerResponse } from 'http';
import { fileSystemRouting } from '../src/helpers/dynamicRouting.js';
import { JsonRpcServer } from '../src/JsonRpcServer.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { serveHttp } from '../src/helpers/serveHttp.js';


type Ctx = {};
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const server = fileSystemRouting<Ctx>(resolve(__dirname, 'methods')).then(router => new JsonRpcServer<Ctx>(router));

createServer(async (request, response) => {
    serveHttp<Ctx>(await server, {}, request, response);
})
.listen(3000);