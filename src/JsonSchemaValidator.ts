import { Ajv, Options as AjvOptions, ValidateFunction, ErrorObject } from 'ajv';
import { type JSONSchema } from 'json-schema-to-ts';

type NodeWorkerThreads = typeof import('worker_threads');

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


// Node で dynamic import（ブラウザでは実行されない）
export async function getNodeWorkerThreads(): Promise<NodeWorkerThreads | null> {
    if (!isNode) return null;
    return import('worker_threads');
}

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
        readonly schema: JSONSchema,
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
        const NodeWorker = await getNodeWorkerThreads();
        if (NodeWorker) {
            return NodeWorkerValidation(NodeWorker, this.schema, data);
        }
        if (isBrowser || isWebWorker) {
            return WebWorkerValidation(Worker, this.schema, data);
        }
        // Worker が使えない環境では同期処理を行う
        return this.validate(data);
    }
}

async function NodeWorkerValidation(NodeWorker: NodeWorkerThreads, schema: JSONSchema, data: unknown): Promise<ValidationResult> {
    const { Worker } = NodeWorker;
    const worker = new Worker(currentFile, {
        workerData: { [methodName]: { schema, data } },
    });
    return new Promise((resolve, reject) => {
        worker
            .on('message', resolve)
            .on('messageerror', reject)
            .on('error', reject);
    });
}

async function kickValidateInNodeWorker(): Promise<void> {
    const { workerData, parentPort } = (await getNodeWorkerThreads()) ?? {};
    const { schema, data } = workerData?.[methodName] ?? {};
    if (!parentPort || !schema || !data) return;
    try {
        const validated = new JsonSchemaValidator(schema).validate(data);
        parentPort.postMessage(validated);
    } catch (err) {
        parentPort.emit('messageerror', err);
    } finally {
        parentPort.close();
    }
}

async function WebWorkerValidation(WebWorker: typeof Worker, schema: JSONSchema, data: unknown): Promise<ValidationResult> {
    const script = `import '${currentFile}';`;
    const objectUrl = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
    const worker = new WebWorker(objectUrl);
    return new Promise<ValidationResult>((resolve, reject) => {
        worker.addEventListener('message', (ev) => resolve(ev.data));
        worker.addEventListener('error', reject);
        worker.addEventListener('messageerror', reject);
        worker.postMessage({ [methodName]: { schema, data } });
    }).finally(() => {
        worker.terminate();
        URL.revokeObjectURL(objectUrl);
    });
}

function kickValidateInWebWorker(): void {
    if (!isWebWorker) return;
    const worker = self;
    worker.addEventListener('message', (ev) => {
        const { schema, data } = (ev.data as any)?.[methodName] ?? {};
        if (!schema || !data) return;
        try {
            const validated = new JsonSchemaValidator(schema).validate(data);
            worker.postMessage(validated);
        } catch (err) {
            worker.postMessage({ error: err });
        } finally {
            worker.close();
        }
    });
}

(() => {
    kickValidateInWebWorker();
    kickValidateInNodeWorker();
})();


