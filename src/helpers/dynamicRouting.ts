import { lstatSync, readdirSync } from 'fs';
import { JsonRpcAsyncRouter } from '../JsonRpcRouter.js';
import { JsonRpcMethodDefinition } from '../JsonRpcMethod.js';

type Stat = {
    name: string;
    path: string;
    directory: boolean;
};

type MethodDef<Context> = JsonRpcMethodDefinition<Context, any, any>;
type AsyncRouter<Context> = {
    [path: string]: Promise<AsyncRouter<Context>|MethodDef<Context>|undefined>;
};
type RoutingLoader<Context> = {
    [path: string]: () => Promise<AsyncRouter<Context>|MethodDef<Context>|undefined>;
};

export async function dynamicRouting<Ctx = any> (rootPath: string, enumerator: (path: string) => AsyncIterable<Stat>) : Promise<JsonRpcAsyncRouter<Ctx>> {
    const loader = {} as RoutingLoader<Ctx>;
    for await (const { name, path, directory } of enumerator(rootPath)) {
        if(directory) {
            loader[name] = () => dynamicRouting<Ctx>(path, enumerator) as Promise<AsyncRouter<Ctx>>;
            continue;
        }
        if (name.match(/\.[jt]s$/)) {
            const methodName = name.replace(/\.[jt]s$/, '');
            loader[methodName] = () => importMethod<Ctx>(path);
            continue;
        }
    }

    const cache = {} as AsyncRouter<Ctx>;
    return new Proxy(cache, {
        get: (target, prop: string) => cache[prop] ??= loader[prop]?.()
    });
}

async function importMethod<Context>(path: string): Promise<MethodDef<Context>|undefined> {
    try {
        const module = await import(path);
        if(module.default instanceof JsonRpcMethodDefinition) {
            return module.default;
        }
        console.info(`Ignoring routing without default export as JsonRpcMethodDefinition: ${path}`);
    } catch(e) {
        console.error(`Invalid routing: ${path}`, e);
    }
    return undefined;
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