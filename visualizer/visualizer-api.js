(function () {
  if (!window.ApiClient) {
    throw new Error('ApiClient is required before visualizer-api.js');
  }

  window.VisualizerApi = {
    async listResumes() {
      return ApiClient.getJson('/api/resumes');
    },

    async getDirectionClues() {
      return ApiClient.getJson('/api/direction-clues');
    },

    async getResume(file) {
      return ApiClient.getJson(`/api/resume?file=${encodeURIComponent(file || '')}`);
    },

    async listResumeTemplates() {
      return ApiClient.getJson('/api/resume-templates');
    },

    async importResumeTemplate(payload) {
      return ApiClient.postJson('/api/resume-templates', payload);
    },

    async saveResumeLineEdit(payload) {
      return ApiClient.postJson('/api/resume-line-edits', payload);
    },

    async getResumeEdits(file) {
      return ApiClient.getJson(`/api/resume-edits?file=${encodeURIComponent(file || '')}`);
    },

    async getResumeVersions(file) {
      return ApiClient.getJson(`/api/resume-versions?file=${encodeURIComponent(file || '')}`);
    },

    async createResumeVersion(payload) {
      return ApiClient.postJson('/api/resume-versions', payload);
    },

    async restoreResumeVersion(payload) {
      return ApiClient.postJson('/api/resume-versions/restore', payload);
    },

    async autoGenerateResume(payload) {
      return ApiClient.postJson('/api/resumes/auto-generate', payload);
    },

    async getWorkspaceResource(resourcePath) {
      return ApiClient.getJson(`/api/workspace-resource?path=${encodeURIComponent(resourcePath || '')}`);
    },

    async saveWorkspaceResource(payload) {
      return ApiClient.postJson('/api/workspace-resource', payload);
    },

    async getExperienceFiles() {
      return ApiClient.getJson('/api/experience-files');
    },

    async importExperienceFile(payload) {
      return ApiClient.postJson('/api/experience-files', payload);
    },

    async saveExperienceMetadata(payload) {
      return ApiClient.postJson('/api/experience-metadata', payload);
    },

    async getRecruitmentMarket() {
      return ApiClient.getJson('/api/recruitment-market');
    },

    async searchRecruitmentMarket(payload) {
      return ApiClient.postJson('/api/recruitment-market/search', payload);
    },

    async crawlRecruitmentMarket() {
      return ApiClient.postJson('/api/recruitment-market/crawl', {});
    },

    async addManualRecruitmentJob(payload) {
      return ApiClient.postJson('/api/recruitment-market/manual-jobs', payload);
    },

    async deleteRecruitmentJob(payload) {
      return ApiClient.postJson('/api/recruitment-market/delete-job', payload);
    },

    async updateRecruitmentJob(payload) {
      return ApiClient.postJson('/api/recruitment-market/update-job', payload);
    },

    async parseRecruitmentJobWithExtension(payload) {
      return ApiClient.postJson('/api/recruitment-market/parse-with-extension', payload);
    },

    async getExtensionParseTask(payload = {}) {
      const params = new URLSearchParams();
      if (payload.taskId) params.set('taskId', payload.taskId);
      if (payload.jobId) params.set('jobId', payload.jobId);
      return ApiClient.getJson(`/api/recruitment-market/extension-task?${params.toString()}`);
    },

    async parseRecruitmentJobWithCodex(payload) {
      return ApiClient.postJson('/api/recruitment-market/parse-with-codex', payload);
    },

    async getCodexParseTask(payload = {}) {
      const params = new URLSearchParams();
      if (payload.taskId) params.set('taskId', payload.taskId);
      if (payload.jobId) params.set('jobId', payload.jobId);
      return ApiClient.getJson(`/api/recruitment-market/codex-task?${params.toString()}`);
    },

    async listReplyDrafts() {
      return ApiClient.getJson('/api/reply-drafts');
    },

    async createReplyDraft(payload) {
      return ApiClient.postJson('/api/reply-drafts', payload);
    },

    async updateReplyDraftStatus(payload) {
      return ApiClient.postJson('/api/reply-drafts/status', payload);
    },

    async getEvidenceRequests() {
      return ApiClient.getJson('/api/evidence-requests');
    },

    async listApplications() {
      return ApiClient.getJson('/api/applications');
    },

    async listRecruitmentMarket() {
      return ApiClient.getJson('/api/recruitment-market');
    },

    async saveApplicationEvent(payload) {
      return ApiClient.postJson('/api/application-events', payload);
    },
  };
})();
