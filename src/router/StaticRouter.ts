import { JsonRpcMethodDefinition, JsonRpcMethodSchema } from "../JsonRpcMethod.js";
import { JsonRpcRouter, JsonRpcSchema } from "./JsonRpcRouter.js";

type RouteMap<Ctx> = {
    readonly [path: string]: RouteMap<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|Promise<RouteMap<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|undefined>;
};

type RouteCache<Ctx> = {
    [path: string]: StaticRouter<Ctx>|JsonRpcMethodDefinition<Ctx, any, any>|null;
};

export class StaticRouter<Ctx> extends JsonRpcRouter<Ctx> {
    constructor(private readonly routeMap: RouteMap<Ctx>) {
        super();
    }

    #cache = {} as RouteCache<Ctx>;
    async resolveChild(methodPath: string) {
        if (methodPath in this.#cache) return this.#cache[methodPath];
        const child = await this.routeMap[methodPath];
        if (!child) return this.#cache[methodPath] = null;
        if (child instanceof JsonRpcMethodDefinition) return this.#cache[methodPath] = child;
        return this.#cache[methodPath] = new StaticRouter<Ctx>(child);
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
        for(const key in this.routeMap) {
            yield key;
        }
    }
}