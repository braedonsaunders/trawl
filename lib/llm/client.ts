import { getConfig } from '@/lib/config';
import type { LLMCallOptions, LLMCallResult } from '@/lib/llm/types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Strip markdown code fences from LLM output before parsing JSON.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 */
function stripCodeFences(text: string): string {
  let cleaned = text.trim();

  // Remove leading ```json or ```
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
  }

  // Remove trailing ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

/**
 * Parse JSON from LLM output, gracefully handling markdown code fences.
 */
function parseJSONResponse<T>(content: string): T {
  const cleaned = stripCodeFences(content);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse LLM response as JSON. ` +
        `Content (first 500 chars): ${cleaned.slice(0, 500)}`
    );
  }
}

/**
 * Call an LLM via the OpenRouter API.
 * Returns the parsed JSON object and the model that was used.
 */
export async function callLLM<T = unknown>(
  options: LLMCallOptions
): Promise<LLMCallResult<T>> {
  const config = getConfig();

  if (!config.openRouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const model = options.model || config.openRouterDefaultModel;

  const requestBody = {
    model,
    messages: [
      { role: 'system' as const, content: options.systemPrompt },
      { role: 'user' as const, content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 1000,
    response_format: { type: 'json_object' as const },
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'HTTP-Referer': 'https://trawl.app',
      'X-Title': 'Trawl',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API request failed (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      `OpenRouter API error: ${data.error.message || JSON.stringify(data.error)}`
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(
      'OpenRouter API returned empty response. ' +
        `Full response: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  const modelUsed = data.model || model;
  const parsed = parseJSONResponse<T>(content);

  return { parsed, model: modelUsed };
}
