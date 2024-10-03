import { lstatSync, readdirSync } from 'fs';
import { JsonRpcRouter } from '../JsonRpcRouter.js';
import { JsonRpcMethodDefinition } from '../JsonRpcMethod.js';

type Stat = {
    name: string;
    path: string;
    directory: boolean;
};

export async function dynamicRouting<Ctx = any> (rootPath: string, enumerator: (path: string) => AsyncIterable<Stat>) : Promise<JsonRpcRouter<Ctx>> {
    const router = {} as  { [name: string]: JsonRpcRouter<Ctx>|JsonRpcMethodDefinition<Ctx, any, any> };
    for await (const { name, path, directory } of enumerator(rootPath)) {
        if(directory) {
            const subRouter = await dynamicRouting<Ctx>(path, enumerator);
            if (Object.keys(subRouter).length > 0) {
                router[name] = subRouter;
            }
            continue;
        }
        try {
            const module = await import(path);
            if(module.default instanceof JsonRpcMethodDefinition) {
                const methodName = name.replace(/\.[jt]s$/, '');
                router[methodName] = module.default;
            }
        } catch (e) {}
    }
    return router;
}

export function fileSystemRouting<Ctx = any> (rootPath: string) {
    return dynamicRouting<Ctx>(rootPath, fsEnumerate);
};

export async function * fsEnumerate (rootPath: string) {
    for (const name of readdirSync(rootPath)) {
        const path = `${rootPath}/${name}`;
        const stat = lstatSync(path);
        yield {
            name,
            path,
            directory: stat.isDirectory()
        };
    }
}