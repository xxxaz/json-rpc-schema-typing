import { JsonSerializable } from "@xxxaz/stream-api-json";

export async function hashObject(src: JsonSerializable): Promise<string> {
    const json = orderGuaranteeJson(src);
    const srcBuffer = await new Blob([json]).arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", srcBuffer);
    return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function orderGuaranteeJson(src: JsonSerializable): string {
    if (src === undefined) return 'null';
    if (src === null) return 'null';
    switch (typeof src) {
        case 'string':
        case 'number':
        case 'boolean':
            return JSON.stringify(src);
        case 'object':
            if (Array.isArray(src)) {
                const stringfied = src.map(orderGuaranteeJson);
                return `[${stringfied.join(',')}]`;
            }
            const stringfied = Object.entries(src)
                .filter(([k, v]) => v !== undefined)
                .sort(([k1], [k2]) => k1 < k2 ? -1 : 1)
                .map(([k, v]) => JSON.stringify(k) + ':' + orderGuaranteeJson(v));
            return `{${stringfied.join(',')}}`;
        default:
            throw new TypeError('Unexpected type');
    }
}
