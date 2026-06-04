package screens

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// NewPipelineModel creates a new pipeline screen.
func NewPipelineModel(t theme.Theme, apps []model.CareerApplication, metrics model.PipelineMetrics, careerOpsPath string, width, height int) PipelineModel {
	m := PipelineModel{
		apps:          apps,
		metrics:       metrics,
		sortMode:      sortScore,
		activeTab:     0,
		viewMode:      "grouped",
		width:         width,
		height:        height,
		theme:         t,
		careerOpsPath: careerOpsPath,
		reportCache:   make(map[string]reportSummary),
	}
	m.applyFilterAndSort()
	return m
}

// Init implements tea.Model.
func (m PipelineModel) Init() tea.Cmd {
	return nil
}

// Resize updates dimensions.
func (m *PipelineModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

// Width returns the current width.
func (m PipelineModel) Width() int { return m.width }

// Height returns the current height.
func (m PipelineModel) Height() int { return m.height }

// CopyReportCache copies the report cache from another pipeline model.
func (m PipelineModel) CopyReportCache(other *PipelineModel) {
	for k, v := range other.reportCache {
		m.reportCache[k] = v
	}
}

// EnrichReport caches report summary data for preview.
func (m *PipelineModel) EnrichReport(reportPath, archetype, tldr, remote, comp string) {
	m.reportCache[reportPath] = reportSummary{
		archetype: archetype,
		tldr:      tldr,
		remote:    remote,
		comp:      comp,
	}
}

// WithReloadedData rebuilds the pipeline with fresh tracker data while preserving
// the current UI state so manual refresh feels seamless.
func (m PipelineModel) WithReloadedData(apps []model.CareerApplication, metrics model.PipelineMetrics) PipelineModel {
	selectedReportPath := ""
	selectedCompany := ""
	selectedRole := ""
	if app, ok := m.CurrentApp(); ok {
		selectedReportPath = app.ReportPath
		selectedCompany = app.Company
		selectedRole = app.Role
	}

	reloaded := NewPipelineModel(m.theme, apps, metrics, m.careerOpsPath, m.width, m.height)
	reloaded.sortMode = m.sortMode
	reloaded.activeTab = m.activeTab
	reloaded.viewMode = m.viewMode
	// Preserve search state across refresh — otherwise pressing `r` silently drops a
	// committed query and the user loses their place mid-investigation.
	reloaded.searchQuery = m.searchQuery
	reloaded.searchInput = m.searchInput
	reloaded.applyFilterAndSort()
	reloaded.CopyReportCache(&m)

	for i, app := range reloaded.filtered {
		if selectedReportPath != "" && app.ReportPath == selectedReportPath {
			reloaded.cursor = i
			reloaded.adjustScroll()
			return reloaded
		}
		if selectedReportPath == "" && app.Company == selectedCompany && app.Role == selectedRole {
			reloaded.cursor = i
			reloaded.adjustScroll()
			return reloaded
		}
	}

	if len(reloaded.filtered) == 0 {
		reloaded.cursor = 0
		reloaded.scrollOffset = 0
		return reloaded
	}

	if m.cursor >= len(reloaded.filtered) {
		reloaded.cursor = len(reloaded.filtered) - 1
	} else if m.cursor > 0 {
		reloaded.cursor = m.cursor
	}
	reloaded.adjustScroll()
	return reloaded
}

// CurrentApp returns the currently selected application, if any.
func (m PipelineModel) CurrentApp() (model.CareerApplication, bool) {
	if m.cursor < 0 || m.cursor >= len(m.filtered) {
		return model.CareerApplication{}, false
	}
	return m.filtered[m.cursor], true
}
