package screens

import (
	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// PipelineClosedMsg is emitted when the pipeline screen is dismissed.
type PipelineClosedMsg struct{}

// PipelineOpenReportMsg is emitted when a report should be opened in FileViewer.
type PipelineOpenReportMsg struct {
	Path   string
	Title  string
	JobURL string
}

// PipelineOpenURLMsg is emitted when a job URL should be opened in browser.
type PipelineOpenURLMsg struct {
	URL string
}

// PipelineLoadReportMsg requests lazy loading of a report summary.
type PipelineLoadReportMsg struct {
	CareerOpsPath string
	ReportPath    string
}

// PipelineUpdateStatusMsg requests a status update for an application.
type PipelineUpdateStatusMsg struct {
	CareerOpsPath string
	App           model.CareerApplication
	NewStatus     string
}

// PipelineRefreshMsg requests a full tracker reload from disk.
type PipelineRefreshMsg struct{}

// PipelineOpenProgressMsg is emitted when the progress screen should open.
type PipelineOpenProgressMsg struct{}

type reportSummary struct {
	archetype string
	tldr      string
	remote    string
	comp      string
}

// Sort modes.
const (
	sortScore   = "score"
	sortDate    = "date"
	sortCompany = "company"
	sortStatus  = "status"
)

// Filter modes.
const (
	filterAll       = "all"
	filterEvaluated = "evaluated"
	filterApplied   = "applied"
	filterInterview = "interview"
	filterSkip      = "skip"
	filterRejected  = "rejected"
	filterDiscarded = "discarded"
	filterTop       = "top"
)

type pipelineTab struct {
	filter string
	label  string
}

var pipelineTabs = []pipelineTab{
	{filterAll, "ALL"},
	{filterEvaluated, "EVALUATED"},
	{filterApplied, "APPLIED"},
	{filterInterview, "INTERVIEW"},
	{filterTop, "TOP ≥4"},
	{filterSkip, "SKIP"},
	{filterRejected, "REJECTED"},
	{filterDiscarded, "DISCARDED"},
}

var sortCycle = []string{sortScore, sortDate, sortCompany, sortStatus}

var statusOptions = []string{"Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"}

// statusGroupOrder defines display order for grouped view.
var statusGroupOrder = []string{"interview", "offer", "responded", "applied", "evaluated", "skip", "rejected", "discarded"}

// PipelineModel implements the career pipeline dashboard screen.
type PipelineModel struct {
	apps          []model.CareerApplication
	filtered      []model.CareerApplication
	metrics       model.PipelineMetrics
	cursor        int
	scrollOffset  int
	sortMode      string
	activeTab     int
	viewMode      string // "grouped" or "flat"
	width, height int
	theme         theme.Theme
	careerOpsPath string
	reportCache   map[string]reportSummary
	// Status picker sub-state
	statusPicker bool
	statusCursor int
	// Search sub-state — narrows the active tab by substring on company/role/notes.
	searchInput bool   // true while the user is typing the query
	searchQuery string // committed (or in-progress) lowercased query
}
