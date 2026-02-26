/**
 * Agent Skills 実装
 * @see https://agentskills.io/
 * @see https://ai-sdk.dev/cookbook/guides/agent-skills
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { YAML } from 'bun';
import { exec as nodeExec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(nodeExec);

// ============================================================================
// Sandbox インターフェース
// ============================================================================

/**
 * ファイルシステムアクセスのためのサンドボックスインターフェース
 */
export interface Sandbox {
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  readdir(
    path: string,
    opts: { withFileTypes: true },
  ): Promise<{ name: string; isDirectory(): boolean }[]>;
  exec(command: string): Promise<{ stdout: string; stderr: string }>;
}

/**
 * Node.js fs を使用したデフォルトサンドボックス実装
 */
export function createNodeSandbox(workingDirectory?: string): Sandbox {
  return {
    readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
    readdir: (dirPath, opts) => fs.readdir(dirPath, opts),
    exec: async (command) => {
      const result = await exec(command, {
        cwd: workingDirectory || process.cwd(),
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });
      return { stdout: result.stdout, stderr: result.stderr };
    },
  };
}

// ============================================================================
// スキル型定義
// ============================================================================

/**
 * スキルのメタデータ
 */
export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

// ============================================================================
// callOptionsSchema
// ============================================================================

/**
 * エージェント呼び出し時のオプションスキーマ
 * prepareCall で使用される
 */
export const callOptionsSchema = z.object({
  sandbox: z.custom<Sandbox>(),
  skills: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      path: z.string(),
    }),
  ),
});

// ============================================================================
// フロントマターパース処理
// ============================================================================

/**
 * YAMLフロントマターをパースする
 */
export function parseFrontmatter(content: string): {
  name: string;
  description: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    throw new Error('No frontmatter found');
  }

  const result = YAML.parse(match[1]) as Record<string, string>;

  if (!result.name || !result.description) {
    throw new Error('Missing required frontmatter fields: name and description');
  }

  return {
    name: result.name,
    description: result.description,
  };
}

/**
 * フロントマターを取り除いて本文のみを取得
 */
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

// ============================================================================
// スキル検出
// ============================================================================

/**
 * スキルディレクトリを走査して利用可能なスキルを検出
 */
export async function discoverSkills(
  sandbox: Sandbox,
  directories: string[],
): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const seenNames = new Set<string>();

  for (const dir of directories) {
    // チルダを展開
    const expandedDir = dir.startsWith('~')
      ? path.join(process.env.HOME || '', dir.slice(1))
      : dir;

    let entries: { name: string; isDirectory(): boolean }[];
    try {
      entries = await sandbox.readdir(expandedDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = `${expandedDir}/${entry.name}`;
      const skillFile = `${skillDir}/SKILL.md`;

      try {
        const content = await sandbox.readFile(skillFile, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        if (seenNames.has(frontmatter.name)) continue;
        seenNames.add(frontmatter.name);

        skills.push({
          name: frontmatter.name,
          description: frontmatter.description,
          path: skillDir,
        });
      } catch {
        // SKILL.mdがない、または不正なスキルはスキップ
      }
    }
  }

  return skills;
}

// ============================================================================
// システムプロンプト構築
// ============================================================================

/**
 * スキル一覧をシステムプロンプト用の文字列に変換
 */
export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return '';
  }

  const skillsList = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `
## Skills
Use the \`loadSkill\` tool to load a skill when the user's request
would benefit from specialized instructions.

Available skills:
${skillsList}
`;
}

// ============================================================================
// ツール定義
// ============================================================================

/**
 * loadSkillツール
 * experimental_context から sandbox と skills を取得
 */
export const loadSkillTool = tool({
  description: 'Load a skill to get specialized instructions',
  inputSchema: z.object({
    name: z.string().describe('The skill name to load'),
  }),
  execute: async ({ name }, { experimental_context }): Promise<{
    skillDirectory?: string;
    content?: string;
    error?: string;
  }> => {
    const { sandbox, skills } = experimental_context as {
      sandbox: Sandbox;
      skills: SkillMetadata[];
    };

    const skill = skills.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );

    if (!skill) {
      return { error: `Skill '${name}' not found` };
    }

    const skillFile = `${skill.path}/SKILL.md`;
    const content = await sandbox.readFile(skillFile, 'utf-8');
    const body = stripFrontmatter(content);

    return {
      skillDirectory: skill.path,
      content: body,
    };
  },
});

/**
 * readFileツール
 * スキルがバンドルされたリソースにアクセスするために使用
 */
export const readFileTool = tool({
  description: 'Read a file from the filesystem',
  inputSchema: z.object({
    path: z.string().describe('The file path to read'),
  }),
  execute: async ({ path }, { experimental_context }) => {
    const { sandbox } = experimental_context as { sandbox: Sandbox };
    return sandbox.readFile(path, 'utf-8');
  },
});

/**
 * bashツール
 * スキルがスクリプトを実行するために使用
 */
export const bashTool = tool({
  description: 'Execute a bash command',
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
  }),
  execute: async ({ command }, { experimental_context }) => {
    const { sandbox } = experimental_context as { sandbox: Sandbox };
    return sandbox.exec(command);
  },
});
