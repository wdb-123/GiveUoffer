import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonFile } from '../data-store.mjs';
import { listExperienceFiles } from './asset-service.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const profilePath = resolve(root, 'data/experience-profile.json');
const codexBin = process.env.CODEX_BIN || 'codex';

export function registerExperienceProfileRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/experience-profile', readExperienceProfile);
  registerJsonRoute('POST', '/api/experience-profile/generate', generateExperienceProfile);
}

async function readExperienceProfile() {
  return readJsonFile(profilePath, { updatedAt: '', engine: '', profile: null });
}

async function generateExperienceProfile() {
  const assets = await listExperienceFiles();
  const prompt = buildExperienceProfilePrompt(assets);
  const profile = await generateProfileWithCodex(prompt);
  const payload = {
    updatedAt: new Date().toISOString(),
    engine: 'codex-llm',
    promptVersion: 'experience-profile-v1',
    profile,
  };
  await writeJsonFile(profilePath, payload);
  return payload;
}

async function generateProfileWithCodex(prompt) {
  if (codexBin.includes('/') && !existsSync(codexBin)) throw new Error(`Codex 命令不存在：${codexBin}`);
  const { stdout } = await runCodexExec(prompt, { timeoutMs: 240_000 });
  return normalizeProfileJson(stdout);
}

function buildExperienceProfilePrompt(assets) {
  const projectFiles = (assets.files || []).map(compactTextAsset).slice(0, 12);
  const intentions = (assets.intentions || []).map(compactTextAsset).slice(0, 6);
  const photos = (assets.photos || []).map((item) => ({
    name: item.name,
    path: item.path,
    title: item.title,
  })).slice(0, 8);

  return `你是一个严谨的中文职业画像分析助手。请根据用户导入的个人信息，生成“职业画像”。

输入包括：
1. 项目经历文件：项目标题、文件名、正文。
2. 职业意向偏好：用户对岗位、行业、工作方式、薪资、城市、禁忌项的偏好。
3. 职业照资产：只可作为资料完整度参考，不要评价长相、年龄、性别、种族、健康等敏感属性。

硬性规则：
1. 只能使用输入中已有的信息推断，禁止编造公司、成果、指标、学校、经历、奖项、论文、专利。
2. 不要输出敏感画像：不要推断性别、年龄、民族、健康、政治、宗教、家庭、财富状态。
3. 画像必须服务于求职产品：用于岗位筛选、简历生成、投递策略和补证据清单。
4. 如果信息不足，明确写入 gaps，不要伪造成果。
5. 输出必须是 JSON，不能有 Markdown、代码块或解释。
6. JSON 必须符合这个结构：
{
  "headline": "一句话职业画像",
  "summary": "2-4 句画像说明，说明根据哪些导入信息得到该判断",
  "persona": ["核心画像点，3-6条"],
  "fitRoles": ["适合优先投递的岗位，4-8条"],
  "resumeFocus": ["生成简历时应该突出的内容，4-8条"],
  "gaps": ["还需要补充的证据，4-8条"],
  "reasoning": ["判断过程，必须写清楚 根据过往经历xxx，选择/判断xxx，得到xxx，4-8条"],
  "tags": ["技能/方向标签，8-16条"],
  "categories": ["能力类别，3-8条"],
  "evidence": ["可写入简历的已知证据，4-10条"]
}

项目经历文件：
${JSON.stringify(projectFiles, null, 2)}

职业意向偏好：
${JSON.stringify(intentions, null, 2)}

职业照资产：
${JSON.stringify(photos, null, 2)}
`;
}

function compactTextAsset(item) {
  return {
    name: item.name,
    path: item.path,
    title: item.title,
    kind: item.kind,
    updatedAt: item.updatedAt,
    content: String(item.content || '').slice(0, 8000),
  };
}

function runCodexExec(prompt, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, ['exec', '--ephemeral', '--dangerously-bypass-approvals-and-sandbox', prompt], {
      cwd: root,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const err = new Error('生成职业画像超时');
      err.stdout = stdout;
      err.stderr = stderr;
      rejectPromise(err);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      err.stdout = stdout;
      err.stderr = stderr;
      rejectPromise(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolvePromise({ stdout, stderr });
      const err = new Error(`生成职业画像失败：codex exec exited with ${signal || code}`);
      err.stdout = stdout;
      err.stderr = stderr;
      rejectPromise(err);
    });
  });
}

function normalizeProfileJson(output) {
  const raw = String(output || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('大模型没有返回有效 JSON 职业画像');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const profile = {
    headline: stringValue(parsed.headline),
    summary: stringValue(parsed.summary),
    persona: stringList(parsed.persona),
    fitRoles: stringList(parsed.fitRoles),
    resumeFocus: stringList(parsed.resumeFocus),
    gaps: stringList(parsed.gaps),
    reasoning: stringList(parsed.reasoning),
    tags: stringList(parsed.tags),
    categories: stringList(parsed.categories),
    evidence: stringList(parsed.evidence),
  };
  if (!profile.headline || !profile.persona.length || !profile.reasoning.length) {
    throw new Error('大模型返回的职业画像字段不完整');
  }
  return profile;
}

function stringValue(value) {
  return String(value || '').trim();
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 16);
}
