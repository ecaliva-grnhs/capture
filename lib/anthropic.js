import Anthropic from '@anthropic-ai/sdk';

// Auto-tagging + one-line summary via the Claude API.
//
// We use a single tool call to force structured JSON output, so the model
// returns clean `tags` / `summary` fields instead of prose we'd have to parse.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

let cached = null;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY environment variable.');
  }
  if (!cached) {
    cached = new Anthropic({ apiKey });
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
 * Generate tags + a one-line summary for a thought.
 * @param {string} body raw thought text
 * @returns {Promise<{ tags: string[], summary: string }>}
 */
export async function autoTag(body) {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
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
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    return { tags: [], summary: '' };
  }

  const { tags, summary } = toolUse.input || {};
  return {
    tags: normalizeTags(tags),
    summary: typeof summary === 'string' ? summary.trim() : '',
  };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out.slice(0, 8);
}
