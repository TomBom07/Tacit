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

function toolName(skill) {
  const base = slugify(skill.name).replace(/_/g, '-').slice(0, 42) || 'skill';
  return `tacit_${base}_${skill.id.slice(-6)}`.slice(0, 64);
}

function skillFingerprint(skill) {
  return JSON.stringify({
    id: skill.id,
    revision: skill.revision || 1,
    updatedAt: skill.updatedAt,
    name: skill.name,
    description: skill.description,
    variables: skill.variables,
    semantics: skill.semantics
  });
}

function registerSkillTool(server, store, skill) {
  const name = toolName(skill);
  const effects = confirmationEffects(skill);

  const handle = server.registerTool(
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
      const latest = await store.getSkill(skill.id);
      if (!latest) {
        return { content: [{ type: 'text', text: 'This Tacit skill no longer exists.' }], isError: true };
      }

      const { _confirm = false, ...variables } = args || {};
      try {
        assertRunConfirmed(latest, _confirm);
        const run = await store.queueRun(latest, variables);
        const result = {
          runId: run.id,
          skillId: latest.id,
          revision: latest.revision || 1,
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

  return { name, handle, fingerprint: skillFingerprint(skill) };
}

export function createMcpServer({ store = new Store(), skills = [] } = {}) {
  const server = new McpServer(
    { name: 'tacit', version: '0.3.0' },
    {
      instructions: [
        'Tacit exposes browser procedures learned from human demonstrations.',
        'A tool call queues a browser run for the local Tacit extension.',
        'Never set _confirm=true unless the user has explicitly confirmed the listed external effect.',
        'Skill tools can change while the server is running; refresh the tool list when notified.'
      ].join(' ')
    }
  );

  const skillTools = new Map();

  server.registerTool(
    'tacit_list_skills',
    {
      description: 'List browser procedures currently learned by Tacit.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true }
    },
    async () => {
      const current = await store.listSkills();
      const summary = current.map((skill) => ({
        id: skill.id,
        toolName: toolName(skill),
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
    'tacit_run_skill',
    {
      description: 'Queue any Tacit skill by ID or slug. Prefer a dedicated learned-skill tool when available.',
      inputSchema: z.object({
        skillId: z.string().min(1),
        variables: z.record(z.string(), z.unknown()).optional(),
        confirmed: z.boolean().optional().describe('Only true after explicit user confirmation of external effects.')
      }).strict()
    },
    async ({ skillId, variables = {}, confirmed = false }) => {
      const skill = await store.getSkill(skillId);
      if (!skill) return { content: [{ type: 'text', text: 'Skill not found.' }], isError: true };
      try {
        assertRunConfirmed(skill, confirmed);
        const run = await store.queueRun(skill, variables);
        const result = { runId: run.id, skillId: skill.id, status: run.status };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    }
  );

  server.registerTool(
    'tacit_list_runs',
    {
      description: 'List recent Tacit runs, optionally filtered by status or skill.',
      inputSchema: z.object({
        status: z.string().optional(),
        skillId: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional()
      }).strict(),
      annotations: { readOnlyHint: true }
    },
    async ({ status, skillId, limit }) => {
      const runs = await store.listRuns({ status, skillId, limit });
      return {
        content: [{ type: 'text', text: JSON.stringify(runs, null, 2) }],
        structuredContent: { runs }
      };
    }
  );

  server.registerTool(
    'tacit_cancel_run',
    {
      description: 'Cancel a queued or currently running Tacit browser procedure.',
      inputSchema: z.object({ runId: z.string().min(1) }).strict(),
      annotations: { destructiveHint: false, idempotentHint: true }
    },
    async ({ runId }) => {
      const run = await store.cancelRun(runId);
      if (!run) return { content: [{ type: 'text', text: 'Run not found.' }], isError: true };
      const result = { runId: run.id, status: run.status };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
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

  for (const skill of skills) {
    skillTools.set(skill.id, registerSkillTool(server, store, skill));
  }

  server.tacitSkillTools = skillTools;
  return server;
}

export function startSkillSync(server, store, { intervalMs = 1000 } = {}) {
  const handles = server.tacitSkillTools || new Map();

  const sync = async () => {
    const skills = await store.listSkills();
    const liveIds = new Set(skills.map((skill) => skill.id));

    for (const [skillId, registered] of handles) {
      if (!liveIds.has(skillId)) {
        registered.handle.remove();
        handles.delete(skillId);
      }
    }

    for (const skill of skills) {
      const fingerprint = skillFingerprint(skill);
      const existing = handles.get(skill.id);
      if (existing?.fingerprint === fingerprint) continue;

      if (existing) existing.handle.remove();
      handles.set(skill.id, registerSkillTool(server, store, skill));
    }
  };

  const timer = setInterval(() => sync().catch((error) => {
    console.error('[Tacit MCP sync]', error.message);
  }), intervalMs);
  timer.unref?.();

  return {
    sync,
    stop: () => clearInterval(timer)
  };
}

export async function startMcpServer(options = {}) {
  const store = options.store || new Store();
  const skills = await store.listSkills();
  const server = createMcpServer({ store, skills });
  const watcher = startSkillSync(server, store, { intervalMs: options.intervalMs || 1000 });
  await watcher.sync();
  await serveStdio(() => server);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch((error) => {
    console.error('[Tacit MCP]', error);
    process.exitCode = 1;
  });
}
