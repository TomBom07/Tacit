#!/usr/bin/env node
import { startServer } from './server.js';
import { Store } from './store.js';
import { exportAgentBundle } from './exporter.js';

const [command = 'help', ...args] = process.argv.slice(2);
const store = new Store();

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

function parseVariables(args) {
  return Object.fromEntries(args.map((entry) => {
    const index = entry.indexOf('=');
    if (index === -1) throw new Error(`Expected key=value, got: ${entry}`);
    return [entry.slice(0, index), entry.slice(index + 1)];
  }));
}

async function main() {
  switch (command) {
    case 'serve': {
      const portIndex = args.indexOf('--port');
      const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4317;
      await startServer({ port });
      print(`Tacit runtime listening on http://127.0.0.1:${port}`);
      print('Load extension/ as an unpacked Chrome extension, then demonstrate a workflow.');
      return;
    }
    case 'list': {
      const skills = await store.listSkills();
      if (!skills.length) return print('No skills learned yet.');
      for (const skill of skills) print(`${skill.id}\t${skill.name}\t${skill.steps.length} steps`);
      return;
    }
    case 'show': {
      const skill = await store.getSkill(args[0]);
      if (!skill) throw new Error('Skill not found.');
      return print(skill);
    }
    case 'tool': {
      const skill = await store.getSkill(args[0]);
      if (!skill) throw new Error('Skill not found.');
      return print(exportAgentBundle(skill));
    }
    case 'run': {
      const skill = await store.getSkill(args[0]);
      if (!skill) throw new Error('Skill not found.');
      const run = await store.queueRun(skill, parseVariables(args.slice(1)));
      print(`Queued ${run.id}. Keep Chrome open with the Tacit extension enabled.`);
      return;
    }
    default:
      print(`Tacit — teach software by doing\n\nCommands:\n  tacit serve [--port 4317]\n  tacit list\n  tacit show <skill-id-or-slug>\n  tacit tool <skill-id-or-slug>\n  tacit run <skill-id-or-slug> [key=value ...]`);
  }
}

main().catch((error) => {
  process.stderr.write(`Tacit: ${error.message}\n`);
  process.exitCode = 1;
});
