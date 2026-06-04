package screens

import (
	"sort"
	"strings"

	"github.com/santifer/career-ops/dashboard/internal/data"
	"github.com/santifer/career-ops/dashboard/internal/model"
)

// matchesSearch reports whether app contains the query as a case-insensitive
// substring of its company, role, or notes. Empty query matches everything.
// Lowercases both sides so callers don't have to remember the contract.
func matchesSearch(app model.CareerApplication, query string) bool {
	if query == "" {
		return true
	}
	q := strings.ToLower(query)
	if strings.Contains(strings.ToLower(app.Company), q) {
		return true
	}
	if strings.Contains(strings.ToLower(app.Role), q) {
		return true
	}
	if strings.Contains(strings.ToLower(app.Notes), q) {
		return true
	}
	return false
}

// applyFilterAndSort rebuilds the filtered list from apps.
func (m *PipelineModel) applyFilterAndSort() {
	var filtered []model.CareerApplication

	currentFilter := pipelineTabs[m.activeTab].filter
	for _, app := range m.apps {
		if !matchesSearch(app, m.searchQuery) {
			continue
		}
		norm := data.NormalizeStatus(app.Status)
		switch currentFilter {
		case filterAll:
			filtered = append(filtered, app)
		case filterTop:
			if app.Score >= 4.0 && norm != "skip" {
				filtered = append(filtered, app)
			}
		default:
			if norm == currentFilter {
				filtered = append(filtered, app)
			}
		}
	}

	// Sort
	switch m.sortMode {
	case sortScore:
		sort.SliceStable(filtered, func(i, j int) bool {
			return filtered[i].Score > filtered[j].Score
		})
	case sortDate:
		sort.SliceStable(filtered, func(i, j int) bool {
			return filtered[i].Date > filtered[j].Date
		})
	case sortCompany:
		sort.SliceStable(filtered, func(i, j int) bool {
			return strings.ToLower(filtered[i].Company) < strings.ToLower(filtered[j].Company)
		})
	case sortStatus:
		sort.SliceStable(filtered, func(i, j int) bool {
			return data.StatusPriority(filtered[i].Status) < data.StatusPriority(filtered[j].Status)
		})
	}

	// In grouped mode, always sort by status priority first, then by selected sort within groups
	if m.viewMode == "grouped" {
		sort.SliceStable(filtered, func(i, j int) bool {
			pi := data.StatusPriority(filtered[i].Status)
			pj := data.StatusPriority(filtered[j].Status)
			if pi != pj {
				return pi < pj
			}
			// Within same group, use selected sort
			switch m.sortMode {
			case sortScore:
				return filtered[i].Score > filtered[j].Score
			case sortDate:
				return filtered[i].Date > filtered[j].Date
			case sortCompany:
				return strings.ToLower(filtered[i].Company) < strings.ToLower(filtered[j].Company)
			default:
				return filtered[i].Score > filtered[j].Score
			}
		})
	}

	m.filtered = filtered
}

func (m PipelineModel) countForFilter(filter string) int {
	count := 0
	for _, app := range m.apps {
		norm := data.NormalizeStatus(app.Status)
		switch filter {
		case filterAll:
			count++
		case filterTop:
			if app.Score >= 4.0 && norm != "skip" {
				count++
			}
		default:
			if norm == filter {
				count++
			}
		}
	}
	return count
}

func (m PipelineModel) countByNormStatus(status string) int {
	count := 0
	for _, app := range m.filtered {
		if data.NormalizeStatus(app.Status) == status {
			count++
		}
	}
	return count
}

func (m PipelineModel) cursorLineEstimate() int {
	if m.viewMode != "grouped" {
		return m.cursor
	}
	// Account for group headers
	line := 0
	prevStatus := ""
	for i, app := range m.filtered {
		norm := data.NormalizeStatus(app.Status)
		if norm != prevStatus {
			line++ // group header
			prevStatus = norm
		}
		if i == m.cursor {
			return line
		}
		line++
	}
	return line
}

// chromeRowsFixed returns the number of fixed chrome rows above/below the body
// (header + tabs(2) + metrics + sortbar + help + 1 search bar when active).
// Shared by View() and adjustScroll() so the search-row addition stays in sync.
func (m PipelineModel) chromeRowsFixed() int {
	rows := 7 // header + tabs(2) + metrics + sortbar + help + preview baseline
	if m.searchInput || m.searchQuery != "" {
		rows++
	}
	return rows
}
