import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpExecutor } from '@viewstem/core/http';
import { runPathAudit, coverage } from './http-path-cases.mjs';
const {results} = await runPathAudit(createHttpExecutor);
for(const result of results)test(result.id,()=>assert.equal(result.passed,true,JSON.stringify(result)));
