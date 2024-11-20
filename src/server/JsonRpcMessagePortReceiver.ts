import { JsonRpcServer } from './JsonRpcServer.js';
import { JsonRpcRouter } from '../router/JsonRpcRouter.js';
import { JsonRpcRequest, MessageInput, MessageListener, MessageOutput } from '../types.js';
import { isRpcRequest } from '../utility.js';

type MessagePortReceiverOprions = {
    validator?: (event: MessageEvent) => boolean;
};

export class JsonRpcMessagePortReceiver<Ctx> extends JsonRpcServer<Ctx> {
    readonly #input: MessageInput;
    readonly #validator: (event: MessageEvent) => boolean;

    constructor(router: JsonRpcRouter<Ctx>, messageInput: MessageInput, options: MessagePortReceiverOprions = {}) {
        super(router);
        this.#input = messageInput;
        this.#validator = options.validator ?? defaultValidator;
    }
    
    async #onMessage(context: Ctx, output: MessageOutput, event: MessageEvent) {
        if (event.source && event.source !== output) return;
        const { data } = event;
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
        if (!this.#validator(event)) {
            console.warn('Invalid Message:', event);
            return;
        }

        const response
            = request instanceof Array
                ? await Promise.all(request.map(req => this.call(context, req)))
                : await this.call(context, request);
        
        if (event.source instanceof Window) {
            event.source.postMessage(response, event.origin);
        } else {
            (event.source ?? output).postMessage(response);
        }
    };

    readonly #listeners = new WeakMap<MessageOutput, MessageListener>();
    serve(context: Ctx, output: MessageOutput) {
        if (this.#listeners.has(output)) return;
        const listener = this.#onMessage.bind(this, context, output);
        this.#listeners.set(output, listener);
        this.#input.addEventListener('message', listener);
    }

    unservce(output: MessageOutput) {
        const listener = this.#listeners.get(output);
        if (!listener) return;
        this.#input.removeEventListener('message', listener);
        this.#listeners.delete(output);
    }
}

function defaultValidator(event: MessageEvent) {
    if (event.source instanceof Window) {
        return event.origin === globalThis.origin;
    }
    return true;
}
