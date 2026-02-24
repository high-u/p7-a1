import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs } from 'ai';
import {
  createNodeSandbox,
  discoverSkills,
  buildSkillsPrompt,
  loadSkillTool,
  readFileTool,
  bashTool,
  callOptionsSchema,
} from './skills';

/**
 * OpenAI API 互換プロバイダーの設定
 */
const openaiProvider = createOpenAI({
  baseURL: process.env.PROVIDER_BASE_URL,
  apiKey: process.env.PROVIDER_API_KEY || 'dummy',
});

// スキルディレクトリ
const SKILL_DIRECTORIES = ['.agents/skills'];

/**
 * エージェントを作成
 */
function createAgent() {
  const modelId = process.env.PROVIDER_MODEL_ID || '';

  // モデル作成
  // Chat API (/v1/chat/completions) を使用
  // modelId が空の場合、空文字列を渡す
  // 一部の OpenAI 互換 API では プロバイダー側で事前設定されたモデルが使用される
  const model = openaiProvider.chat(modelId);

  return new ToolLoopAgent({
    model,
    instructions: 'You are a helpful assistant that can execute commands and create files.',
    tools: {
      loadSkill: loadSkillTool,
      readFile: readFileTool,
      bash: bashTool,
    },
    callOptionsSchema,
    prepareCall: ({ options, ...settings }) => {
      const baseInstructions = settings.instructions || '';
      const skillsPrompt = buildSkillsPrompt(options.skills);
      const instructions = skillsPrompt ? `${baseInstructions}\n\n${skillsPrompt}` : baseInstructions;

      console.log('[DEBUG] prepareCall called');
      console.log('[DEBUG] options.skills:', JSON.stringify(options.skills, null, 2));
      console.log('[DEBUG] instructions:', instructions);

      return {
        ...settings,
        instructions,
        experimental_context: {
          sandbox: options.sandbox,
          skills: options.skills,
        },
      };
    },
    stopWhen: stepCountIs(Number(process.env.AGENT_MAX_STEPS) || 50),
  });
}

/**
 * AIエージェントのメイン処理
 */
export async function chatWithAI(prompt: string) {
  // サンドボックスを作成
  const sandbox = createNodeSandbox(process.cwd());

  // スキルを検出
  const skills = await discoverSkills(sandbox, SKILL_DIRECTORIES);
  console.log('[DEBUG] Discovered skills:', JSON.stringify(skills, null, 2));

  // エージェントを作成
  const agent = createAgent();
  console.log('[DEBUG] Agent tools:', Object.keys(agent.tools));

  // エージェントを実行
  console.log('[DEBUG] Calling agent.generate with prompt:', prompt);
  const result = await agent.generate({
    prompt,
    options: { sandbox, skills },
  });

  console.log('[DEBUG] Result steps:', result.steps?.length);
  console.log('[DEBUG] Result text length:', result.text?.length);

  // 各ステップの詳細をログ出力
  if (result.steps) {
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i];
      console.log(`\n[DEBUG] === Step ${i + 1} ===`);

      // content をログ出力（ツールコールとツール結果が含まれる）
      if (step.content) {
        for (const part of step.content) {
          if (part.type === 'tool-call') {
            console.log(`[DEBUG] Tool call: ${part.toolName}`);
            console.log('[DEBUG]   Input:', JSON.stringify(part.input, null, 2));
          } else if (part.type === 'tool-result') {
            console.log(`[DEBUG] Tool result: ${part.toolName}`);
            console.log('[DEBUG]   Output:', JSON.stringify(part.output, null, 2));
          } else if (part.type === 'tool-error') {
            console.log(`[DEBUG] Tool error: ${part.toolName}`);
            console.log('[DEBUG]   Error:', JSON.stringify(part, null, 2));
          } else if (part.type === 'text') {
            console.log('[DEBUG] Text:', part.text?.substring(0, 200));
          }
        }
      }
    }
  }

  return {
    reply: result.text,
  };
}
