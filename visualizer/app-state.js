const resumeSelect = document.querySelector('#resumeSelect');
const templateSelect = document.querySelector('#templateSelect');
const densitySelect = document.querySelector('#densitySelect');
const resumeTemplateImportBtn = document.querySelector('#resumeTemplateImportBtn');
const resumeTemplateImportInput = document.querySelector('#resumeTemplateImportInput');
const resumeTemplateStatus = document.querySelector('#resumeTemplateStatus');
const resumeTemplateList = document.querySelector('#resumeTemplateList');
const autoGenerateResumeBtn = document.querySelector('#autoGenerateResumeBtn');
const paper = document.querySelector('#paper');
const statusEl = document.querySelector('#status');
const titleEl = document.querySelector('#docTitle');
const docTitleButton = document.querySelector('#docTitleButton');
const resumeTitleMenu = document.querySelector('#resumeTitleMenu');
const fileEl = document.querySelector('#docFile');
const strategyCluesEl = document.querySelector('#strategyNote');
const directionCluesEl = document.querySelector('#directionClues');
const contextTitle = document.querySelector('#contextTitle');
const contextSubtitle = document.querySelector('#contextSubtitle');
const marketRailTabs = document.querySelector('#marketRailTabs');
const marketRailModeButtons = document.querySelectorAll('[data-market-rail-mode]');
const projectHighlightsEl = document.querySelector('#projectHighlights');
const resumeView = document.querySelector('#resumeView');
const experienceView = document.querySelector('#experienceView');
const applicationsView = document.querySelector('#applicationsView');
const marketView = document.querySelector('#marketView');
const evidenceView = document.querySelector('#evidenceView');
const replyView = document.querySelector('#replyView');
const experienceViewBtn = document.querySelector('#experienceViewBtn');
const resumeViewBtn = document.querySelector('#resumeViewBtn');
const marketViewBtn = document.querySelector('#marketViewBtn');
const applicationsViewBtn = document.querySelector('#applicationsViewBtn');
const evidenceViewBtn = document.querySelector('#evidenceViewBtn');
const replyViewBtn = document.querySelector('#replyViewBtn');
const applicationMetrics = document.querySelector('#applicationMetrics');
const priorityJobs = document.querySelector('#priorityJobs');
const allJobs = document.querySelector('#allJobs');
const applicationImportText = document.querySelector('#applicationImportText');
const applicationParseBtn = document.querySelector('#applicationParseBtn');
const applicationClearImportBtn = document.querySelector('#applicationClearImportBtn');
const applicationImportResult = document.querySelector('#applicationImportResult');
const evidenceMetrics = document.querySelector('#evidenceMetrics');
const evidenceRequestsEl = document.querySelector('#evidenceRequests');
const replyMetrics = document.querySelector('#replyMetrics');
const replyDraftsEl = document.querySelector('#replyDrafts');
const replyPlatformBoard = document.querySelector('#replyPlatformBoard');
const replyChatList = document.querySelector('#replyChatList');
const replyStatus = document.querySelector('#replyStatus');
const aiButlerNewChatBtn = document.querySelector('#aiButlerNewChatBtn');
const aiChatMessages = document.querySelector('#aiChatMessages');
const aiChatForm = document.querySelector('#aiChatForm');
const aiChatInput = document.querySelector('#aiChatInput');
const aiConversationList = document.querySelector('#aiConversationList');
const resumeToolbarControls = document.querySelector('#resumeToolbarControls');
const experienceToolbarControls = document.querySelector('#experienceToolbarControls');
const exportMenu = document.querySelector('.export-menu');
const editPreviewBtn = document.querySelector('#editPreviewBtn');
const savePreviewBtn = document.querySelector('#savePreviewBtn');
const editHistoryEl = document.querySelector('#editHistory');
const saveResumeVersionBtn = document.querySelector('#saveResumeVersionBtn');
const resumeVersionSelect = document.querySelector('#resumeVersionSelect');
const restoreResumeVersionBtn = document.querySelector('#restoreResumeVersionBtn');
const resumeVersionStatus = document.querySelector('#resumeVersionStatus');
const marketMetrics = document.querySelector('#marketMetrics');
const marketListSummary = document.querySelector('#marketListSummary');
const marketJobs = document.querySelector('#marketJobs');
const marketSearchStatus = document.querySelector('#marketSearchStatus');
const marketChannelList = document.querySelector('#marketChannelList');
const officialCompanyList = document.querySelector('#officialCompanyList');
const marketCompanyTypeFilter = document.querySelector('#marketCompanyTypeFilter');
const marketDirectionFilter = document.querySelector('#marketDirectionFilter');
const marketSalaryFilter = document.querySelector('#marketSalaryFilter');
const marketMatchFilter = document.querySelector('#marketMatchFilter');
const marketLocationFilter = document.querySelector('#marketLocationFilter');
const marketSearchInput = document.querySelector('#marketSearchInput');
const marketGroupSelect = document.querySelector('#marketGroupSelect');
const marketSortSelect = document.querySelector('#marketSortSelect');
const marketMinScoreSelect = document.querySelector('#marketMinScoreSelect');
const marketManualImportForm = document.querySelector('#marketManualImportForm');
const marketManualImportSubmitBtn = document.querySelector('#marketManualImportSubmitBtn');
const marketManualImportCancelBtn = document.querySelector('#marketManualImportCancelBtn');
const marketManualFields = {
  company: document.querySelector('#marketManualCompany'),
  role: document.querySelector('#marketManualRole'),
  url: document.querySelector('#marketManualUrl'),
  reason: document.querySelector('#marketManualReason'),
  rawText: document.querySelector('#marketManualRawText'),
  location: document.querySelector('#marketManualLocation'),
  salary: document.querySelector('#marketManualSalary'),
  keywords: document.querySelector('#marketManualKeywords'),
};
const experienceImportInput = document.querySelector('#experienceImportInput');
const headshotImportInput = document.querySelector('#headshotImportInput');
const intentionImportInput = document.querySelector('#intentionImportInput');
const experienceFileList = document.querySelector('#experienceFileList');
const headshotList = document.querySelector('#headshotList');
const intentionList = document.querySelector('#intentionList');
const experienceFileCount = document.querySelector('#experienceFileCount');
const headshotCount = document.querySelector('#headshotCount');
const intentionCount = document.querySelector('#intentionCount');
const experienceVersions = document.querySelector('#experienceVersions');
const experienceStatus = document.querySelector('#experienceStatus');
const experienceSaveBtn = document.querySelector('#experienceSaveBtn');
const experienceMarkdownPaper = document.querySelector('#experienceMarkdownPaper');
const experienceGeneratedOutput = document.querySelector('#experienceGeneratedOutput');
const experienceGeneratedTitle = document.querySelector('#experienceGeneratedTitle');
const experienceGeneratedBody = document.querySelector('#experienceGeneratedBody');
const experienceDiagnosis = document.querySelector('#experienceDiagnosis');
const experienceFields = {
  title: document.querySelector('#experienceTitle'),
  category: document.querySelector('#experienceCategory'),
  role: document.querySelector('#experienceRole'),
  sourceFile: document.querySelector('#experienceSourceFile'),
  summary: document.querySelector('#experienceSummary'),
  tags: document.querySelector('#experienceTags'),
  evidence: document.querySelector('#experienceEvidence'),
  gaps: document.querySelector('#experienceGaps'),
  publicLevel: document.querySelector('#experiencePublicLevel'),
};
const resourceEditor = document.querySelector('#resourceEditor');
const resourceTitle = document.querySelector('#resourceTitle');
const resourceList = document.querySelector('#resourceList');
const resourceBody = document.querySelector('#resourceBody');
const resourceText = document.querySelector('#resourceText');
const resourcePreview = document.querySelector('#resourcePreview');
const resourceStatus = document.querySelector('#resourceStatus');
const resourceSaveBtn = document.querySelector('#resourceSaveBtn');
const resourceCloseBtn = document.querySelector('#resourceCloseBtn');
const replyGenerateBtn = document.querySelector('#replyGenerateBtn');

let currentFile = '';
let currentView = 'resume';
let directionClues = {};
let resumeOptions = [];
let currentMarketData = { jobs: [] };
let currentMarketRailMode = 'manual';
let currentCodexWorkflowState = { jobId: '', status: '', message: '', output: '' };
let currentApplicationsData = [];
let currentReplyData = { drafts: [] };
let selectedChatId = '';
let currentExperienceData = { experiences: [], versions: [] };
let currentExperienceFiles = [];
let currentHeadshots = [];
let currentIntentions = [];
let currentExperiencePath = '';
let currentExperienceAssetType = 'file';
let currentResourcePath = '';
let currentResumeVersions = [];
let currentApplicationImportSource = 'email';
let latestApplicationImportProposal = null;
let renderEditMode = false;
let resumePaginationQueued = false;
let currentAiConversationId = 'overview';
let renderedAutosaveTimers = new Map();
const aiConversations = [
  {
    id: 'overview',
    title: '本轮求职复盘',
    updatedAt: '刚刚',
    messages: [
      {
        role: 'assistant',
        text: '这里是复盘中心。你可以把投递反馈、无回复、拒绝原因或面试问题放进来，我会帮你总结原因，并更新下一轮岗位策略、简历证据和行动清单。',
      },
    ],
  },
  {
    id: 'experience-gaps',
    title: '简历证据缺口',
    updatedAt: '今天',
    messages: [
      {
        role: 'assistant',
        text: '最近复盘重点：把 EtherCAT 项目的从站数量、控制周期、复现频率、最终定位结论和客户反馈补成可投递证据。',
      },
    ],
  },
  {
    id: 'market-followup',
    title: '岗位策略调整',
    updatedAt: '昨天',
    messages: [
      {
        role: 'assistant',
        text: '根据岗位机会雷达，下一轮优先验证机器人系统工程师、机器人软件工程师和现场应用工程师，低匹配岗位先暂停。',
      },
    ],
  },
];
