import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';
import { ALL_MODELS } from '../../core/types.js';
import type { ModelType, Task } from '../../core/types.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';
import { loadConfig } from '../../core/config.js';
import { SpawnBackendFactory } from '../../orchestra/spawn-backend.js';
import { buildWorkerPrompt } from '../../orchestra/brain.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { brainEstimateTimeout } from '../../orchestra/timeout-estimator.js';

function generateJobId(): string {
  return `run-${Date.now().toString(36)}`;
}

export function registerRunTool(server: McpServer): void {
  server.registerTool(
    'deckent_run',
    {
      title: 'Run Task',
      description: 'Run a single one-off task outside of a full sprint. Creates a task JSON file and spawns a Claude worker immediately. Returns a jobId for tracking. Use when you need a quick isolated task without the full sprint lifecycle overhead (no PLAN/EVALUATE/RETRO phases). Use deckent_status to monitor the spawned worker. Example: fix a specific bug, write a single test file, update a doc.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        description: z.string().describe('Clear description of what the worker should do. Be specific: include file paths, expected outcome, and any constraints.'),
        model: z.enum(ALL_MODELS as unknown as readonly [string, ...string[]]).optional().default('sonnet').describe('AI model to use. Supports all providers (Claude, OpenAI, Gemini). Default: sonnet'),
        scope: z.string().optional().describe('Comma-separated directory paths the worker may modify (e.g. "src/,tests/"). Defaults to "src/" if omitted.'),
        autoApprove: z.boolean().optional().default(true).describe('Auto-approve worker tool calls with --dangerously-skip-permissions. Deckent standard: workers MUST have full write permissions.'),
        effort: z.enum(['low', 'normal', 'high']).optional().default('normal').describe('Estimated effort. Drives the per-task timeout via timeout.effort_base in config (low ~10m, normal ~20m, high ~40m on docker). Use "high" for broad codebase audits.'),
        timeoutSeconds: z.number().int().min(60).max(7200).optional().describe('Hard timeout override (seconds). Bypasses effort-based estimation. Range 60-7200. Use when you know the task needs more than `high` effort grants (e.g. multi-file analysis + report writing).'),
      }),
    },
    async ({ description, model, scope, autoApprove, effort, timeoutSeconds }) => {
      const root = process.cwd();

      try {
        const jobId = generateJobId();
        const taskId = `run-${jobId}`;
        const tasksDir = join(root, TASKS_DIR);
        mkdirSync(tasksDir, { recursive: true });

        const directories = scope ? scope.split(',').map((s) => s.trim()) : ['src/'];
        const task = {
          id: taskId,
          title: description.slice(0, 80),
          description,
          model,
          effort,
          priority: 'NORMAL',
          scope: { directories, filesRead: [], filesWrite: [] },
          reason: 'One-off task via MCP deckent_run',
          dependencies: [],
          goNogo: {
            goCriteria: 'Task completed successfully',
            noGoCriteria: 'Task failed or timed out',
            techDebtAcceptable: 'Minor issues acceptable',
          },
          status: 'PENDING',
          sprintId: 'one-off',
          createdAt: new Date().toISOString(),
          assignedAgent: 'generic',
          assignedSkills: [],
          provider: 'claude',
        };

        writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2) + '\n');

        // Build worker prompt with agent/skill context
        const agentPrompt = await resolveAgentPrompt(root, task as Task);
        const skillPrompts = await resolveSkillPrompts(root, task as Task);
        const prompt = buildWorkerPrompt(task as Task, agentPrompt, skillPrompts);

        // Spawn worker via config-aware backend (docker/tmux/subprocess/auto)
        const cfg = await loadConfig(root);
        const backend = SpawnBackendFactory.create({
          backend: cfg.spawn_backend ?? 'auto',
          projectDir: root,
          dockerImage: cfg.docker_image,
          dockerTimeoutSeconds: cfg.docker_timeout,
        });

        // Per-task timeout: explicit override wins, else estimate from effort.
        // Sprint 153 dogfood: default 1200s docker_min was hitting on broad
        // audit prompts; effort="high" or timeoutSeconds=N gives the caller
        // an escape hatch without raising the global default.
        const effectiveTimeoutSeconds = timeoutSeconds
          ?? brainEstimateTimeout(task as Task, cfg, { avgTaskDurationMs: 0, sprintCount: 0 }).timeoutSeconds;

        backend.spawn(taskId, model as ModelType, prompt, {
          autoApprove,
          projectDir: root,
          taskTimeoutSeconds: effectiveTimeoutSeconds,
        });

        writeJobState(root, {
          jobId,
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
        });

        const enriched = enrichResponse('run', {
          jobId,
          taskId,
          status: 'RUNNING',
          model,
          effort,
          timeoutSeconds: effectiveTimeoutSeconds,
          scope: directories,
          backend: backend.name,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
