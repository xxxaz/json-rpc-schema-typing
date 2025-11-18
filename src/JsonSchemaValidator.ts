import { Ajv, Options as AjvOptions, ValidateFunction, ErrorObject } from 'ajv';
import { type JSONSchema } from 'json-schema-to-ts';
import type { Worker as NodeWorker } from 'worker_threads';

const isBrowser =
    typeof window !== 'undefined' && typeof window.document !== 'undefined';
const isWebWorker =
    typeof self !== 'undefined' &&
    typeof (self as any).postMessage === 'function' &&
    typeof (globalThis as any).Window === 'undefined';
const isNode =
    typeof process !== 'undefined' && !!(process as any).versions?.node;

// @ts-ignore
const currentFile = globalThis.__filename || (typeof import.meta !== 'undefined' ? import.meta.filename : '.');

type SerializedError = {
    propertyName?: string;
    message?: string;
    data?: any;
    keyword?: string;
    instancePath?: string;
    schemaPath?: string;
};

function * serializeErrors(error?: ErrorObject[]|null) : Generator<SerializedError> {
    if(!error) return;
    for(const { propertyName, message, schemaPath, data, keyword, instancePath, params } of error) {
        const err = {} as SerializedError;
        if(propertyName) err.propertyName = propertyName;
        if(message) err.message = message;
        if(data) err.data = data;
        if(keyword) err.keyword = keyword;
        if(instancePath) err.instancePath = instancePath;
        if(schemaPath) err.schemaPath = schemaPath;
        if (Object.keys(err).length > 0) {
            yield err;
        }
        if (params.errors) {
            yield * serializeErrors(params.errors);
        }
    }
}


type ValidationResult =
    | { valid: true }
    | {
          valid: false;
          errors: SerializedError[];
          errorsText: string;
      };

const methodName = '@xxxaz/json-schema-typing.JsonSchemaValidator.validate';

export class JsonSchemaValidator {
    constructor(
        readonly schema: JSONSchema & object,
        ajvOptions?: AjvOptions
    ) {
        this.#ajv = new Ajv(ajvOptions);
        this.#validate = this.#ajv.compile(this.schema);
    }

    readonly #ajv: Ajv;
    readonly #validate: ValidateFunction;

    validate(data: unknown): ValidationResult {
        const valid = this.#validate(data);
        if (valid) return { valid: true };
        const errors = Array.from(serializeErrors(this.#validate.errors ?? []));

        // TODO: エラーメッセージの整形を検討する
        const errorsText = this.#ajv.errorsText(this.#validate.errors, {
            separator: '\n',
        });
        return {
            valid: false,
            errors,
            errorsText,
        };
    }

    async validateAsync(data: unknown): Promise<ValidationResult> {
        const worker = await getWorker(this.schema);
        if (!worker) {
            // Worker が使えない環境では同期処理を行う
            return this.validate(data);
        }
        const id = crypto.randomUUID();
        const listener = Promise.withResolvers<ValidationResult>();
        listeners[id] = listener;
        worker.postMessage({ method: methodName, schema: this.schema, data, id });
        return listener.promise;
    }
}

type WorkerType = NodeWorker | Worker;
let workers: WeakMap<object, WorkerType> = new WeakMap();
let listeners: Record<string, PromiseWithResolvers<ValidationResult>> = {};
async function getWorker(key: object): Promise<WorkerType | null> {
    if (workers.has(key)) return workers.get(key) ?? null;

    let worker: WorkerType;
    if (isNode) {
        const NodeWorkerThreads = await import('worker_threads');
        worker = new NodeWorkerThreads.Worker(currentFile);
        worker.on('message', (data) => onMessage(data));
        worker.on('error', (err) => onError(err));
        worker.on('messageerror', (data) => onError(data));
    } else if (isBrowser || isWebWorker) {
        worker = new Worker(currentFile);
        worker.addEventListener('message', (ev) => onMessage(ev.data));
        worker.addEventListener('error', (ev) => onError(ev.error));
        worker.addEventListener('messageerror', (ev) => onFaild(ev.data.id));
    } else {
        return null;
    }
    workers.set(key, worker);
    return worker;
}
function onMessage(data: {id: string, result?: ValidationResult, error?: any}) {
    const listener = listeners[data.id];
    if (listener) {
        if (data.error) {
            listener.reject(data.error);
        } else {
            listener.resolve(data.result!);
        }
        delete listeners[data.id];
    }
}
function onError(err: Error) {
    Object.values(listeners).forEach(({ reject }) => reject(err));
    listeners = {};
}
function onFaild(data: { id: string }) {
    const listener = listeners[data.id];
    if (listener) {
        listener.reject(new Error(`Worker validation failed: ${data.id}`));
        delete listeners[data.id];
    }
}

(async function kickValidateInWorker(): Promise<void> {
    type ReceiveMesg = { method: string; id: string; schema: JSONSchema & object; data: unknown };
    const onMessage = (msg: ReceiveMesg, callback: (result: {}) => void) => {
        const { id, schema, data } = msg;
        try {
            const result = new JsonSchemaValidator(schema).validate(data);
            callback({ id, result });
        } catch (error) {
            callback({ id, error });
        }
    };
    if (isNode) {
        const NodeWorkerThreads = await import('worker_threads');
        const { parentPort } = NodeWorkerThreads;
        if (!parentPort) return;
        parentPort.on('message', (msg: ReceiveMesg) => {
            if (msg.method !== methodName) return;
            onMessage(msg, (result) => parentPort.postMessage(result));
        });
    } else {
        self.addEventListener('message', (ev) => {
            const msg = ev.data as ReceiveMesg;
            if (msg.method !== methodName) return;
            onMessage(msg, (result) => {
                self.postMessage(result);
            });
        });
    }
})();


