import { createServer, IncomingMessage, ServerResponse } from 'http';
import { fileSystemRouting } from '../src/helpers/dynamicRouting.js';
import { JsonRpcServer } from '../src/JsonRpcServer.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { type HttpContext, serveHttp } from '../src/helpers/serveHttp.js';
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const server = fileSystemRouting<HttpContext>(resolve(__dirname, 'methods')).then(router => new JsonRpcServer<HttpContext>(router));

createServer(async (request, response) => {
    serveHttp<HttpContext>(await server, request, response);
})
.listen(3000);