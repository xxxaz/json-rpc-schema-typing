#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --loader=ts-node/esm
import { JsonSchemaValidator } from '../src/JsonSchemaValidator.js';

(async ()=>{
    const validator = new JsonSchemaValidator({
        type: 'number'
    });

    console.log('Validating 42:', validator.validate(42));
    console.log('Validating true:', validator.validate(true));
    console.log('Async Validating 42:', await validator.validateAsync(42));
    console.log('Async Validating true:', await validator.validateAsync(true));
})();