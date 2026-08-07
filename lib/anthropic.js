import Anthropic from '@anthropic-ai/sdk';
import { CONFIG, required } from './env.js';

// Auto-tagging + one-line summary via the Claude API.
//
// A forced tool call gives us structured JSON instead of prose to parse.

let cached = null;

function getClient() {
  if (!cached) {
    cached = new Anthropic({
      apiKey: required('ANTHROPIC_API_KEY'),
      // The SDK default is minutes; capture latency budget is seconds.
      timeout: CONFIG.enrichTimeoutMs(),
      maxRetries: 1,
    });
  }
  return cached;
}

const TAG_TOOL = {
  name: 'save_thought',
  description:
    'Record the extracted tags and a one-line summary for a captured thought.',
  input_schema: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          '3-6 short, lowercase, single- or two-word topical tags (no "#"). ' +
          'Reuse conventional tags where possible so related notes cluster.',
      },
      summary: {
        type: 'string',
        description:
          'A single concise sentence (max ~120 chars) capturing the gist.',
      },
    },
    required: ['tags', 'summary'],
  },
};

/**
 * Generate tags + a one-line summary. Throws on failure — callers that must
 * not fail should use the `safe` wrapper in lib/enrich.js.
 */
export async function autoTag(body, { signal } = {}) {
  const message = await getClient().messages.create(
    {
      model: CONFIG.claudeModel(),
      max_tokens: 512,
      tools: [TAG_TOOL],
      tool_choice: { type: 'tool', name: 'save_thought' },
      messages: [
        {
          role: 'user',
          content:
            'Tag and summarize this captured thought. Be terse and consistent.\n\n' +
            '---\n' +
            body,
        },
      ],
    },
    { signal }
  );

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) return { tags: [], summary: null };

  const { tags, summary } = toolUse.input || {};
  return {
    tags: normalizeTags(tags),
    summary:
      typeof summary === 'string' && summary.trim() ? summary.trim() : null,
  };
}

/** Lowercase, de-duplicate, strip leading '#', and cap the tag list. */
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().replace(/^#+/, '').slice(0, 40);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out.slice(0, 8);
}
