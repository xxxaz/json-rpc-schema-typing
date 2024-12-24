import { JsonRpcServer } from './JsonRpcServer.js';
import { JsonRpcRequest } from '../types.js';
import { isRpcRequest } from '../utility.js';
import { WebSocketWrapper, WrapableWebSocket, wrapWebSocket } from '../WebSocketWrapper.js';
import { Serializable } from '@xxxaz/stream-api-json/types';

export class JsonRpcWebSocketReceiver<Ctx> extends JsonRpcServer<Ctx> {
    async #onMessage(context: Ctx, socket: WebSocketWrapper, data: Serializable) {
        const request
            = (data instanceof Array && data.some(isRpcRequest))
                ? data as JsonRpcRequest[]
            : isRpcRequest(data)
                ? data
                : null;

        if (!request) {
            console.debug('message is not JsonRpcRequest', request);
            return;
        }
        
        const response
            = request instanceof Array
                ? await Promise.all(request.map(req => this.call(context, req)))
                : await this.call(context, request);

        socket.send(JSON.stringify(response));
    };

    readonly #sockets = new Map<WrapableWebSocket, WebSocketWrapper>();
    serve(context: Ctx, socket: WrapableWebSocket) {
        if (this.#sockets.has(socket)) return;
        const listener = (data: Serializable) => this.#onMessage(context, wrapper, data);
        const wrapper = wrapWebSocket(
            socket,
            listener,
            (close) => {
                console.debug('socket closed', close);
                this.unservce(socket);
            }
        );
        this.#sockets.set(socket, wrapper);
    }

    unservce(socket: WrapableWebSocket) {
        const wrapper = this.#sockets.get(socket);
        wrapper?.close();
        this.#sockets.delete(socket);
    }
}
