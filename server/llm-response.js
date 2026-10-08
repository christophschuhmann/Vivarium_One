// Provider response diagnostics intentionally exclude prompts, generated content,
// private reasoning, credentials and arbitrary provider fields.
export function llmResponseContent(data, { provider, model, maxTokens, allowToolCalls = false }) {
  const choice = data?.choices?.[0] || {}, message = choice.message || {}, usage = data?.usage || {};
  // Some compatible gateways emit native function calls even when the prompt
  // requests our JSON tool envelope. Normalize the transport, not permissions:
  // agenticChat/worldTools still enforce the allowlist, world scope and round cap.
  if (allowToolCalls && Array.isArray(message.tool_calls) && message.tool_calls.length && !message.refusal) {
    const toolRequests = message.tool_calls.slice(0, 4).map(entry => {
      const fn = entry?.function;
      try {
        if (!fn || typeof fn.name !== 'string' || !fn.name || fn.name.length > 100) throw Error('Invalid name');
        const raw = fn.arguments ?? '{}';
        if (typeof raw === 'string' && raw.length > 24000) throw Error('Oversized arguments');
        const args = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Arguments must be an object');
        return { tool: fn.name, args };
      } catch {
        // Route malformed calls back as a tool error in the bounded dialogue;
        // never execute a guessed query or discard the whole simulation.
        return { tool: 'invalid_native_tool_call', args: {} };
      }
    });
    return JSON.stringify({ toolRequests });
  }
  let content = message.content;
  if (Array.isArray(content)) content = content.map(b => typeof b === 'string' ? b : typeof b?.text === 'string' ? b.text : '').join('');
  if (typeof content === 'string' && content.trim()) return content;
  const number = value => Number.isFinite(value) && value >= 0 ? value : null;
  const diagnostics = {
    provider, model, responseId: typeof data?.id === 'string' ? data.id.slice(0, 160) : null,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason.slice(0, 80) : null,
    maxTokens, promptTokens: number(usage.prompt_tokens), completionTokens: number(usage.completion_tokens),
    reasoningTokens: number(usage.completion_tokens_details?.reasoning_tokens),
    hasReasoning: !!(message.reasoning_content || message.reasoning || message.reasoning_details?.length),
    hasRefusal: !!message.refusal, hasToolCalls: !!message.tool_calls?.length,
    contentType: message.content == null ? 'null' : Array.isArray(message.content) ? 'array' : typeof message.content,
  };
  const blocked = diagnostics.hasRefusal || ['content_filter', 'safety', 'blocked', 'refusal'].includes(diagnostics.finishReason);
  const limited = diagnostics.finishReason === 'length';
  const code = blocked ? 'LLM_BLOCKED_RESPONSE' : limited ? 'LLM_OUTPUT_LIMIT' : 'LLM_EMPTY_RESPONSE';
  // Reasoning fields alone do not establish token exhaustion. Only a reported
  // output-limit finish reason supports that diagnosis; otherwise keep it unknown.
  const reason = blocked ? 'the provider reported a blocked or refused response'
    : limited ? `the provider reported reaching the ${maxTokens}-token output limit before returning an answer`
    : 'the provider returned an empty answer without a usable explanation';
  throw Object.assign(new Error(`LLM (${model}): ${reason}. No usable story was returned. ${blocked ? 'Review the request or provider settings.' : 'Retry, or choose another language model in Settings.'}`), {
    code, statusCode: blocked ? 422 : 502, diagnostics,
  });
}
