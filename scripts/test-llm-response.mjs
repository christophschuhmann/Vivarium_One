import assert from 'node:assert/strict';
import { llmResponseContent } from '../server/llm-response.js';
const config={provider:'hyprlab',model:'gemini-3.8-flash',maxTokens:10000};
const response=(content,finish_reason='stop',extra={})=>({id:'request-fixture',choices:[{finish_reason,message:{content,...extra}}],usage:{prompt_tokens:123,completion_tokens:456,completion_tokens_details:{reasoning_tokens:400}}});
assert.equal(llmResponseContent(response('Actual answer'),config),'Actual answer');
assert.equal(llmResponseContent(response([{text:'First'},' second']),config),'First second');
for(const content of [null,'','  ',[],[{type:'reasoning',reasoning:'PRIVATE'}],{}]){
  assert.throws(()=>llmResponseContent(response(content),config),e=>e.code==='LLM_EMPTY_RESPONSE'&&e.diagnostics.finishReason==='stop'&&e.diagnostics.promptTokens===123);
}
assert.throws(()=>llmResponseContent(response(null,'length',{reasoning_content:'PRIVATE REASONING'}),config),e=>e.code==='LLM_OUTPUT_LIMIT'&&e.diagnostics.reasoningTokens===400&&!JSON.stringify(e).includes('PRIVATE'));
assert.throws(()=>llmResponseContent(response(null,'stop',{reasoning_content:'PRIVATE REASONING'}),config),e=>e.code==='LLM_EMPTY_RESPONSE'&&!e.message.includes('whole')&&e.diagnostics.hasReasoning);
assert.throws(()=>llmResponseContent(response(null,'content_filter'),config),e=>e.code==='LLM_BLOCKED_RESPONSE');
assert.throws(()=>llmResponseContent(response(null,'stop',{refusal:'PRIVATE REFUSAL'}),config),e=>e.code==='LLM_BLOCKED_RESPONSE'&&!JSON.stringify(e).includes('PRIVATE'));
assert.throws(()=>llmResponseContent({choices:[],api_key:'SECRET',usage:{}},config),e=>e.code==='LLM_EMPTY_RESPONSE'&&!JSON.stringify(e).includes('SECRET')&&e.diagnostics.finishReason===null);
console.log('PASS text and content blocks; null/blank/malformed answers; explicit output limit vs unknown; blocked/refusal; metadata without private reasoning or credentials');
const native=response(null,'tool_calls',{tool_calls:[{type:'function',function:{name:'journal',arguments:'{"id":"owned-sim","limit":3}'}}]});
assert.deepEqual(JSON.parse(llmResponseContent(native,{...config,allowToolCalls:true})),{toolRequests:[{tool:'journal',args:{id:'owned-sim',limit:3}}]});
assert.throws(()=>llmResponseContent(native,config),e=>e.diagnostics.hasToolCalls&&e.code==='LLM_EMPTY_RESPONSE','ordinary non-agent calls do not gain tool execution');
const malformed=response(null,'tool_calls',{tool_calls:[{function:{name:'journal',arguments:'{broken'}}]});assert.equal(JSON.parse(llmResponseContent(malformed,{...config,allowToolCalls:true})).toolRequests[0].tool,'invalid_native_tool_call');
console.log('PASS native tool calls normalized only for agentic surfaces; malformed arguments become bounded tool errors, never guessed queries');
