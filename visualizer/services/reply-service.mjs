import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile, writeJsonFile } from '../data-store.mjs';
import { readJsonBody } from './request-utils.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const dataDir = join(root, 'data');
const replyDraftsPath = join(dataDir, 'reply-drafts.json');

export function registerReplyRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/reply-drafts', listReplyDrafts);
  registerJsonRoute('POST', '/api/reply-drafts', createReplyDraft);
  registerJsonRoute('POST', '/api/reply-drafts/status', updateReplyDraftStatus);
}

export async function listReplyDrafts() {
  return readJsonFile(replyDraftsPath, {
    updatedAt: '',
    guardrails: [
      '只自动生成草稿，不自动发送。',
      '发送、打招呼、投递和联系方式交换必须由本人确认。',
      '命中平台风控或涉及隐私信息时，回到平台官网手动处理。',
    ],
    drafts: [],
  });
}

export async function createReplyDraft(req) {
  const body = await readJsonBody(req);
  const source = String(body.source || 'Boss 直聘').trim() || 'Boss 直聘';
  const company = String(body.company || '').trim() || '待确认公司';
  const role = String(body.role || '').trim() || '目标岗位';
  const recruiterMessage = String(body.recruiterMessage || '').trim();
  const intent = String(body.intent || inferReplyIntent(recruiterMessage)).trim() || 'interested';
  const tone = String(body.tone || 'professional').trim();
  const salary = String(body.salary || '35K-45K').trim();
  const nextStep = String(body.nextStep || '').trim();
  const now = new Date().toISOString();
  const store = await listReplyDrafts();
  const draft = {
    id: `RD-${Date.now().toString(36)}`,
    source,
    company,
    role,
    intent,
    tone,
    salary,
    recruiterMessage,
    draft: buildReplyDraft({ company, role, recruiterMessage, intent, tone, salary, nextStep }),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    safetyNote: '草稿已生成；发送前需要本人确认，不会自动触达招聘方。',
  };
  store.updatedAt = now;
  store.drafts = [draft, ...(store.drafts || [])].slice(0, 200);
  await writeJsonFile(replyDraftsPath, store);
  return { ok: true, draft, replyDrafts: store };
}

export async function updateReplyDraftStatus(req) {
  const body = await readJsonBody(req);
  const id = String(body.id || '');
  const status = String(body.status || '');
  const allowed = new Set(['draft', 'copied', 'sent-manual', 'archived']);
  if (!id || !allowed.has(status)) throw new Error('Invalid reply draft status');
  const store = await listReplyDrafts();
  const now = new Date().toISOString();
  let updated = null;
  store.drafts = (store.drafts || []).map((draft) => {
    if (draft.id !== id) return draft;
    updated = { ...draft, status, updatedAt: now };
    return updated;
  });
  store.updatedAt = now;
  await writeJsonFile(replyDraftsPath, store);
  return { ok: true, draft: updated, replyDrafts: store };
}

function inferReplyIntent(message) {
  const text = String(message || '');
  if (/薪资|待遇|期望|预算|报价|salary/i.test(text)) return 'salary';
  if (/面试|约|时间|方便|日程|interview/i.test(text)) return 'interview';
  if (/简历|资料|作品|项目|发.*看看|resume|cv/i.test(text)) return 'resume';
  if (/不合适|暂不|考虑|拒绝/i.test(text)) return 'decline';
  return 'interested';
}

function buildReplyDraft({ company, role, recruiterMessage, intent, tone, salary, nextStep }) {
  const prefix = tone === 'concise' ? '' : '您好，';
  const roleText = role === '目标岗位' ? '这个岗位' : `${role}岗位`;
  const commonProof = '我这边主要做机器人系统、关节通信、EtherCAT/CANopen、ROS2/MoveIt 和现场问题闭环，也有用 AI 工具做研发提效、文档和问题复盘的经验。';

  if (intent === 'salary') {
    return `${prefix}感谢沟通。我的期望薪资区间是 ${salary}，具体可以结合岗位职责、工作地点、团队阶段和综合福利再沟通。${commonProof}如果岗位方向匹配，我可以继续发详细简历或约时间沟通。`;
  }

  if (intent === 'interview') {
    return `${prefix}可以的，我对${company}的${roleText}感兴趣。${commonProof}我这边可以配合安排初步沟通，${nextStep || '请您发几个可选时间，我确认后回复' }。`;
  }

  if (intent === 'resume') {
    return `${prefix}可以，我稍后补充详细简历/项目材料。${commonProof}重点项目包括 EtherCAT 通信稳定性、多关节压力测试、eRob 关节通信 SDK 与机器人软件生态支持。您也可以先把 JD 或重点要求发我，我会针对性补充材料。`;
  }

  if (intent === 'decline') {
    return `${prefix}感谢联系。这个岗位我需要再看一下职责和方向，目前我更优先机器人系统工程、机器人软件 SDK、具身智能数据基建和 AI 工程化相关岗位。如果后续有更匹配的岗位，也欢迎继续沟通。`;
  }

  return `${prefix}感谢联系，我对${company}的${roleText}有兴趣。${commonProof}如果方便的话，请您发一下完整 JD、薪资范围、工作地点和面试流程，我看完后可以进一步确认匹配度。`;
}
