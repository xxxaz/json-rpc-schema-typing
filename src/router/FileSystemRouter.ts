import { lstatSync, readdirSync, existsSync } from 'fs';
import { JsonRpcMethodDefinition } from "../JsonRpcMethod.js";
import { JsonRpcRouter } from "./JsonRpcRouter.js";

type RouteCache<Ctx> = {
    [path: string]: FileSystemRouter<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|null;
};

export class FileSystemRouter<Ctx> extends JsonRpcRouter<Ctx> {
    constructor(private readonly rootDir: string) {
        super();
        if (!existsSync(rootDir)) throw new Error(`Not found: ${rootDir}`);
        const stat = lstatSync(rootDir);
        if (!stat.isDirectory()) throw new Error(`Not a directory: ${rootDir}`);
    }

    #cache = {} as RouteCache<Ctx>;
    async resolveChild(methodPath: string) {
        if (methodPath in this.#cache) return this.#cache[methodPath];
        const path = `${this.rootDir}/${methodPath}`;
        if (existsSync(path)) {
            if (lstatSync(path).isDirectory()) {
                return this.#cache[methodPath] = new FileSystemRouter<Ctx>(path);
            }
        }

        const filePath
            = existsSync(`${path}.js`)
                ? `${path}.js`
            : existsSync(`${path}.ts`)
                ? `${path}.ts`
                : null;
        if (!filePath) return this.#cache[methodPath] = null;
        
        try {
            const module = await import(filePath);
            if(module.default instanceof JsonRpcMethodDefinition) {
                return this.#cache[methodPath] = module.default;
            }
            console.warn(`Ignoring routing without default export as JsonRpcMethodDefinition: ${path}`);
        } catch(e) {
            console.error(`Invalid routing: ${path}`, e);
        }

        return null;
    }

    async resolve(methodPath: string|string[]): Promise<JsonRpcRouter<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|null> {
        if (!methodPath || methodPath.length === 0) return this;
        if (typeof methodPath === 'string') methodPath = methodPath.split('.');
        const [head, ...tail] = methodPath;

        const child = await this.resolveChild(head);
        if (tail.length === 0) return child;
        if (!child) {
            console.warn(`Route not found: ${head}`);
            return null;
        }

        if (child instanceof JsonRpcMethodDefinition) {
            console.warn(`Method appear middle in route : ${head}`);
            return null;
        }

        return child.resolve(tail);
    }

    async * enumerate(): AsyncIterable<string> {
        for(const name of readdirSync(this.rootDir)) {
            yield name.replace(/\.(js|ts)$/, '');
        }
    }
}
