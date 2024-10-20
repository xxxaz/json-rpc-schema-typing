import { createServer } from 'http';
import { FileSystemRouter } from '../src/router/FileSystemRouter.js';
import { JsonRpcHttpReceiver } from '../src/server/JsonRpcHttpReceiver.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';


type Ctx = {};
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = new FileSystemRouter<Ctx>(resolve(__dirname, 'methods'));
const script = await router.schemaTypeScript('demo');
writeFileSync(resolve(__dirname, 'schema.ts'), script);

const server = new JsonRpcHttpReceiver<Ctx>(router);
createServer(async (request, response) => {
    server.serve({}, request, response);
})
.listen(3000);