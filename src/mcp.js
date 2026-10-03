import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { Store } from './store.js';
import { slugify } from './utils.js';
import { confirmationEffects, requiresConfirmation, assertRunConfirmed } from './policy.js';

function variableSchema(variable = {}) {
  let schema;
  if (Array.isArray(variable.enum) && variable.enum.length) {
    schema = z.enum(variable.enum);
  } else if (variable.type === 'number') {
    schema = z.number();
  } else if (variable.type === 'integer') {
    schema = z.number().int();
  } else if (variable.type === 'boolean') {
    schema = z.boolean();
  } else {
    schema = z.string();
  }

  if (variable.description) schema = schema.describe(variable.description);
  if (!variable.required) schema = schema.optional();
  return schema;
}

function skillSchema(skill) {
  const shape = {};
  for (const [name, variable] of Object.entries(skill.variables || {})) {
    shape[name] = variableSchema(variable);
  }
  if (requiresConfirmation(skill)) {
    shape._confirm = z.boolean().optional().describe(
      `Set true only after the user explicitly confirms this action. Effects: ${confirmationEffects(skill).join(', ')}.`
    );
  }
  return z.object(shape).strict();
}

function uniqueToolName(skill, used) {
  const base = `tacit_${slugify(skill.name)}`.slice(0, 56) || 'tacit_skill';
  let name = base;
  if (used.has(name)) name = `${base.slice(0, 49)}_${skill.id.slice(-6)}`;
  used.add(name);
  return name;
}

export async function createMcpServer({ store = new Store() } = {}) {
  const server = new McpServer(
    { name: 'tacit', version: '0.2.0' },
    {
      instructions: [
        'Tacit exposes browser procedures learned from human demonstrations.',
        'A tool call queues a browser run for the local Tacit extension.',
        'Never set _confirm=true unless the user has explicitly confirmed the listed external effect.'
      ].join(' ')
    }
  );

  server.registerTool(
    'tacit_list_skills',
    {
      description: 'List browser procedures currently learned by Tacit.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true }
    },
    async () => {
      const skills = await store.listSkills();
      const summary = skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        revision: skill.revision || 1,
        effects: skill.semantics?.effects || []
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        structuredContent: { skills: summary }
      };
    }
  );

  server.registerTool(
    'tacit_get_run',
    {
      description: 'Read the current status and execution log of a Tacit run.',
      inputSchema: z.object({ runId: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: true }
    },
    async ({ runId }) => {
      const run = await store.getRun(runId);
      if (!run) return { content: [{ type: 'text', text: 'Run not found.' }], isError: true };
      return {
        content: [{ type: 'text', text: JSON.stringify(run, null, 2) }],
        structuredContent: { run }
      };
    }
  );

  const used = new Set(['tacit_list_skills', 'tacit_get_run']);
  for (const skill of await store.listSkills()) {
    const name = uniqueToolName(skill, used);
    const effects = confirmationEffects(skill);
    server.registerTool(
      name,
      {
        title: skill.name,
        description: skill.description,
        inputSchema: skillSchema(skill),
        annotations: {
          destructiveHint: effects.some((effect) => ['delete', 'purchase', 'publish', 'send'].includes(effect)),
          openWorldHint: true,
          idempotentHint: false
        }
      },
      async (args) => {
        const { _confirm = false, ...variables } = args || {};
        try {
          assertRunConfirmed(skill, _confirm);
          const run = await store.queueRun(skill, variables);
          const result = {
            runId: run.id,
            skillId: skill.id,
            status: run.status,
            message: 'Queued. The local Tacit browser extension will claim this run.'
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true
          };
        }
      }
    );
  }

  return server;
}

export async function startMcpServer(options = {}) {
  const store = options.store || new Store();
  await serveStdio(() => createMcpServer({ store }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    console.error('[Tacit MCP]', error);
    process.exitCode = 1;
  });
}
