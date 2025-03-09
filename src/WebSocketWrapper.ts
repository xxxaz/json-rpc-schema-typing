import { type WebSocket as NodeWebSocket, type RawData } from 'ws';
import { JsonSerializable } from "@xxxaz/stream-api-json";

export type WrapableWebSocket = WebSocket|NodeWebSocket;
export function wrapWebSocket(socket: WrapableWebSocket, listener: SocketListener, closedListener: ScokcetClosedListener) {
    if ('WebSocket' in globalThis && socket instanceof WebSocket) {
        return new BrowserWebSocketWrapper(socket, listener, closedListener);
    }
    return new NodeWebSocketWrapper(socket as NodeWebSocket, listener, closedListener);
}

type ClosedData = {
    code: number;
    reason: string;
    wasClean?: boolean;
    wrapper: WebSocketWrapper;
};

type SocketListener = (data: JsonSerializable) => void;
type ScokcetClosedListener = (data: ClosedData) => void;

type ConnectionState = 'CONNECTING'|'OPEN'|'CLOSING'|'CLOSED';
export type WebSocketState = (typeof WebSocket)[ConnectionState];

export interface WebSocketWrapper<Socket extends WrapableWebSocket = WrapableWebSocket> {
    readonly socket: Socket;
    readonly listener: SocketListener;
    readonly readyState: WebSocketState;
    send(data: JsonSerializable): void;
    detach(): void;
    close(): void;
}

export class NodeWebSocketWrapper implements WebSocketWrapper<NodeWebSocket> {
    constructor(
        readonly socket: NodeWebSocket,
        readonly listener: SocketListener,
        readonly closedListener: ScokcetClosedListener
    ) {
        socket.on('message', this.#onMessage);
        socket.on('close', (code, reasonBuffer) => {
            const reason = reasonBuffer.toString();
            this.closedListener({ code, reason, wrapper: this });
            this.socket.off('message', this.#onMessage);
        });
    }

    get readyState(): WebSocketState {
        return this.socket.readyState;
    }

    send(data: JsonSerializable): void {
        this.socket.send(JSON.stringify(data));
    }

    detach(): void {
        this.socket.off('message', this.#onMessage);
    }

    close(): void {
        this.detach();
        this.socket.close();
    }

    readonly #onMessage = async (data: RawData) => {
        const parsed = await this.#parseMessage(data);
        this.listener(parsed);
    };

    async #parseMessage(data: RawData) : Promise<JsonSerializable> {
        if (data instanceof ArrayBuffer) {
            return JSON.parse(await new Blob([data]).text());
        }
        const json
            = data instanceof Array
            ? data.map(d=>JSON.parse(d.toString())).join('')
            : data.toString()
        return JSON.parse(json);
    }
}

export class BrowserWebSocketWrapper implements WebSocketWrapper<WebSocket> {
    constructor(
        readonly socket: WebSocket,
        readonly listener: SocketListener,
        readonly closedListener: ScokcetClosedListener
    ) {
        socket.addEventListener('message', this.#onMessage);
        socket.addEventListener('close', ev => {
            closedListener({ code: ev.code, reason: ev.reason, wasClean: ev.wasClean, wrapper: this });
            this.socket.removeEventListener('message', this.#onMessage);
        });
    }

    get readyState(): WebSocketState {
        return this.socket.readyState as WebSocketState;
    }

    readonly #onMessage = async (ev: MessageEvent) => {
        const parsed = await this.#parseMessage(ev.data);
        this.listener(parsed);
    };

    async #parseMessage(data: ArrayBuffer|string|object) : Promise<JsonSerializable> {
        if (data instanceof ArrayBuffer) {
            return JSON.parse(await new Blob([data]).text());
        }
        try {
            if (typeof data === 'string') {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('failed to parse message', data, e);
        }
        return data as JsonSerializable;
    }

    send(data: JsonSerializable): void {
        this.socket.send(JSON.stringify(data));
    }

    detach(): void {
        this.socket.removeEventListener('message', this.#onMessage);
    }

    close(): void {
        this.detach();
        this.socket.close();
    }
}