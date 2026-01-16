import { lstatSync, readdirSync, existsSync } from 'fs';
import { JsonRpcMethodDefinition } from "../JsonRpcMethod.js";
import { JsonRpcRouter } from "./JsonRpcRouter.js";

type RouteCache<Ctx> = {
    [path: string]: FileSystemRouter<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|null;
};

type FileSystemRouterOptions = {
    pathFilter?: (RegExp|((path: string) => boolean));
};

export class FileSystemRouter<Ctx> extends JsonRpcRouter<Ctx> {
    constructor(private readonly rootDir: string, options: FileSystemRouterOptions = {}) {
        super();
        if (!existsSync(rootDir)) throw new Error(`Not found: ${rootDir}`);
        const stat = lstatSync(rootDir);
        if (!stat.isDirectory()) throw new Error(`Not a directory: ${rootDir}`);
        this.#pathFilter = options.pathFilter;
    }
    readonly #pathFilter?: (RegExp|((path: string) => boolean));

    // instanceof JsonRpcMethodDefinition だと参照先モジュールが複数存在した際に一致しなくなる
    static #isDefinition(obj: any): obj is JsonRpcMethodDefinition<any, any, any> {
        const key = obj?.constructor?.method;
        return typeof key === 'symbol' && obj[key] instanceof Function;
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
        if (this.#pathFilter) {
            const pass = this.#pathFilter instanceof RegExp
                ? this.#pathFilter.test(filePath)
                : this.#pathFilter(filePath);
            if (!pass) return this.#cache[methodPath] = null;
        }
        
        try {
            const module = await import(filePath);
            if (FileSystemRouter.#isDefinition(module.default)) {
                return this.#cache[methodPath] = module.default;
            }
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

        if (FileSystemRouter.#isDefinition(child)) {
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
