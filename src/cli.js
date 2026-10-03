#!/usr/bin/env node
import { startServer } from './server.js';
import { Store } from './store.js';
import { exportAgentBundle } from './exporter.js';
import { assertRunConfirmed } from './policy.js';
import fs from 'node:fs/promises';
import { createSkillBundle, parseSkillBundle } from './skill-io.js';

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
      const confirmed = args.includes('--confirm');
      assertRunConfirmed(skill, confirmed);
      const variables = parseVariables(args.slice(1).filter((entry) => entry !== '--confirm'));
      const run = await store.queueRun(skill, variables);
      print(`Queued ${run.id}. Keep Chrome open with the Tacit extension enabled.`);
      return;
    }
    case 'runs': {
      const statusIndex = args.indexOf('--status');
      const skillIndex = args.indexOf('--skill');
      const limitIndex = args.indexOf('--limit');
      const runs = await store.listRuns({
        status: statusIndex >= 0 ? args[statusIndex + 1] : undefined,
        skillId: skillIndex >= 0 ? args[skillIndex + 1] : undefined,
        limit: limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined
      });
      if (!runs.length) return print('No runs found.');
      for (const run of runs) print(`${run.id}\t${run.status}\t${run.skillId}\t${run.createdAt}`);
      return;
    }
    case 'cancel': {
      const run = await store.cancelRun(args[0]);
      if (!run) throw new Error('Run not found.');
      print(`${run.id}: ${run.status}`);
      return;
    }
    case 'export': {
      const skill = await store.getSkill(args[0]);
      if (!skill) throw new Error('Skill not found.');
      const bundle = createSkillBundle(skill);
      const file = args[1] || `${skill.slug || skill.id}.tacit.json`;
      await fs.writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
      print(`Exported ${skill.name} to ${file}`);
      return;
    }
    case 'import': {
      const file = args[0];
      if (!file) throw new Error('Provide a .tacit.json file.');
      const payload = JSON.parse(await fs.readFile(file, 'utf8'));
      const skill = parseSkillBundle(payload);
      const existing = await store.getSkill(skill.id);
      if (existing && !args.includes('--replace')) {
        throw new Error('Skill already exists. Pass --replace to overwrite the same skill ID.');
      }
      if (existing) await store.updateSkill(skill.id, skill);
      else await store.addSkill(skill);
      print(`${existing ? 'Replaced' : 'Imported'} ${skill.name} (${skill.id})`);
      return;
    }
    case 'repairs': {
      const repairs = await store.listRepairs();
      if (!repairs.length) return print('No repair proposals.');
      for (const repair of repairs) {
        print(`${repair.id}\t${repair.status}\t${repair.skillId}\tstep ${repair.stepIndex + 1}\tconfidence ${repair.confidence}`);
      }
      return;
    }
    case 'repair': {
      const repair = await store.getRepair(args[0]);
      if (!repair) throw new Error('Repair not found.');
      return print(repair);
    }
    case 'repair-apply': {
      if (!args.includes('--yes')) throw new Error('Pass --yes to explicitly approve this repair.');
      const repair = await store.getRepair(args[0]);
      if (!repair) throw new Error('Repair not found.');
      const skill = await store.getSkill(repair.skillId);
      if (!skill) throw new Error('Skill not found.');
      const { applyRepair } = await import('./repair.js');
      const repaired = applyRepair(skill, repair);
      await store.updateSkill(skill.id, repaired);
      await store.updateRepair(repair.id, { status: 'applied', appliedAt: new Date().toISOString() });
      print(`Applied ${repair.id}; ${skill.name} is now revision ${repaired.revision}.`);
      return;
    }
    case 'repair-reject': {
      const repair = await store.updateRepair(args[0], { status: 'rejected', rejectedAt: new Date().toISOString() });
      if (!repair) throw new Error('Repair not found.');
      print(`Rejected ${repair.id}.`);
      return;
    }
    case 'mcp': {
      const { startMcpServer } = await import('./mcp.js');
      await startMcpServer({ store });
      return;
    }
    default:
      print(`Tacit — teach software by doing\n\nCommands:\n  tacit serve [--port 4317]\n  tacit mcp\n  tacit list\n  tacit show <skill-id-or-slug>\n  tacit tool <skill-id-or-slug>\n  tacit run <skill-id-or-slug> [key=value ...] [--confirm]\n  tacit runs [--status STATUS] [--skill SKILL] [--limit N]\n  tacit cancel <run-id>\n  tacit export <skill-id-or-slug> [file.tacit.json]\n  tacit import <file.tacit.json> [--replace]\n  tacit repairs\n  tacit repair <repair-id>\n  tacit repair-apply <repair-id> --yes\n  tacit repair-reject <repair-id>`);
  }
}

main().catch((error) => {
  process.stderr.write(`Tacit: ${error.message}\n`);
  process.exitCode = 1;
});
