package screens

import (
	"fmt"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

// Update handles input for the pipeline screen.
func (m PipelineModel) Update(msg tea.Msg) (PipelineModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.statusPicker {
			return m.handleStatusPicker(msg)
		}
		if m.searchInput {
			return m.handleSearchInput(msg)
		}
		return m.handleKey(msg)
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	}
	return m, nil
}

func (m PipelineModel) handleKey(msg tea.KeyMsg) (PipelineModel, tea.Cmd) {
	switch msg.String() {
	case "esc":
		// While a search is committed, Esc clears the search (matches vim's `:nohl`
		// ergonomics). With no query, Esc is a no-op — q is the only quit key, which
		// keeps the help bar honest and avoids accidental exits.
		if m.searchQuery != "" {
			m.searchQuery = ""
			m.applyFilterAndSort()
			m.cursor = 0
			m.scrollOffset = 0
			return m, m.loadCurrentReport()
		}
		return m, nil

	case "q":
		return m, func() tea.Msg { return PipelineClosedMsg{} }

	case "/":
		// Open search input. Pre-fill with the current query so refining is one keystroke away.
		m.searchInput = true
		return m, nil

	case "down", "j":
		if len(m.filtered) > 0 {
			m.cursor++
			if m.cursor >= len(m.filtered) {
				m.cursor = len(m.filtered) - 1
			}
			m.adjustScroll()
			return m, m.loadCurrentReport()
		}

	case "up", "k":
		if len(m.filtered) > 0 {
			m.cursor--
			if m.cursor < 0 {
				m.cursor = 0
			}
			m.adjustScroll()
			return m, m.loadCurrentReport()
		}

	case "s":
		// Cycle sort mode
		for i, s := range sortCycle {
			if s == m.sortMode {
				m.sortMode = sortCycle[(i+1)%len(sortCycle)]
				break
			}
		}
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0

	case "f", "right", "l":
		m.activeTab++
		if m.activeTab >= len(pipelineTabs) {
			m.activeTab = 0
		}
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0

	case "left", "h":
		m.activeTab--
		if m.activeTab < 0 {
			m.activeTab = len(pipelineTabs) - 1
		}
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0

	case "v":
		if m.viewMode == "grouped" {
			m.viewMode = "flat"
		} else {
			m.viewMode = "grouped"
		}

	case "enter":
		if app, ok := m.CurrentApp(); ok && app.ReportPath != "" {
			fullPath := filepath.Join(m.careerOpsPath, app.ReportPath)
			title := fmt.Sprintf("%s — %s", app.Company, app.Role)
			jobURL := app.JobURL
			return m, func() tea.Msg {
				return PipelineOpenReportMsg{Path: fullPath, Title: title, JobURL: jobURL}
			}
		}

	case "o":
		if app, ok := m.CurrentApp(); ok && app.JobURL != "" {
			return m, func() tea.Msg {
				return PipelineOpenURLMsg{URL: app.JobURL}
			}
		}

	case "p":
		return m, func() tea.Msg { return PipelineOpenProgressMsg{} }

	case "r":
		return m, func() tea.Msg { return PipelineRefreshMsg{} }

	case "c":
		if len(m.filtered) > 0 {
			m.statusPicker = true
			m.statusCursor = 0
		}

	case "g":
		if len(m.filtered) > 0 {
			m.cursor = 0
			m.scrollOffset = 0
			return m, m.loadCurrentReport()
		}

	case "G":
		if len(m.filtered) > 0 {
			m.cursor = len(m.filtered) - 1
			m.adjustScroll()
			return m, m.loadCurrentReport()
		}

	case "pgdown", "ctrl+d":
		if len(m.filtered) > 0 {
			halfPage := m.height / 2
			if halfPage < 1 {
				halfPage = 1
			}
			m.cursor += halfPage
			if m.cursor >= len(m.filtered) {
				m.cursor = len(m.filtered) - 1
			}
			m.adjustScroll()
			return m, m.loadCurrentReport()
		}

	case "pgup", "ctrl+u":
		if len(m.filtered) > 0 {
			halfPage := m.height / 2
			if halfPage < 1 {
				halfPage = 1
			}
			m.cursor -= halfPage
			if m.cursor < 0 {
				m.cursor = 0
			}
			m.adjustScroll()
			return m, m.loadCurrentReport()
		}
	}

	return m, nil
}

// handleSearchInput consumes keys while the search input bar is open.
// Esc cancels (closes input AND clears query). Enter commits (closes input,
// keeps query, refreshes filtered list). Backspace + printable chars edit
// the query and live-update the filter so the user sees results as they type.
//
// Report previews are NOT lazy-loaded on every keystroke — that would trigger
// a synchronous os.ReadFile per rune/backspace/ctrl+u and stutter live
// typing. Instead the load fires once when the user commits (Enter) or
// cancels (Esc); subsequent cursor movement in handleKey loads as before.
func (m PipelineModel) handleSearchInput(msg tea.KeyMsg) (PipelineModel, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.searchInput = false
		m.searchQuery = ""
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0
		return m, m.loadCurrentReport()

	case "enter":
		m.searchInput = false
		// Query already applied during typing; load the preview for the
		// committed first match (skipped during typing for perf).
		return m, m.loadCurrentReport()

	case "backspace":
		if len(m.searchQuery) > 0 {
			// Drop the last UTF-8 rune so multi-byte characters delete cleanly.
			runes := []rune(m.searchQuery)
			m.searchQuery = string(runes[:len(runes)-1])
			m.applyFilterAndSort()
			m.cursor = 0
			m.scrollOffset = 0
		}
		return m, nil

	case "ctrl+u":
		// vim-flavored: clear the in-progress query without leaving search mode.
		m.searchQuery = ""
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0
		return m, nil
	}

	// Append printable runes (ignore other special keys like arrows / ctrl-combos).
	if r := msg.Runes; len(r) > 0 {
		m.searchQuery += strings.ToLower(string(r))
		m.applyFilterAndSort()
		m.cursor = 0
		m.scrollOffset = 0
		return m, nil
	}
	return m, nil
}

func (m PipelineModel) handleStatusPicker(msg tea.KeyMsg) (PipelineModel, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		m.statusPicker = false
		return m, nil

	case "down", "j":
		m.statusCursor++
		if m.statusCursor >= len(statusOptions) {
			m.statusCursor = len(statusOptions) - 1
		}

	case "up", "k":
		m.statusCursor--
		if m.statusCursor < 0 {
			m.statusCursor = 0
		}

	case "enter":
		m.statusPicker = false
		if app, ok := m.CurrentApp(); ok {
			newStatus := statusOptions[m.statusCursor]
			return m, func() tea.Msg {
				return PipelineUpdateStatusMsg{
					CareerOpsPath: m.careerOpsPath,
					App:           app,
					NewStatus:     newStatus,
				}
			}
		}
	}
	return m, nil
}

func (m PipelineModel) loadCurrentReport() tea.Cmd {
	app, ok := m.CurrentApp()
	if !ok || app.ReportPath == "" {
		return nil
	}
	if _, cached := m.reportCache[app.ReportPath]; cached {
		return nil
	}
	path := m.careerOpsPath
	report := app.ReportPath
	return func() tea.Msg {
		return PipelineLoadReportMsg{CareerOpsPath: path, ReportPath: report}
	}
}
