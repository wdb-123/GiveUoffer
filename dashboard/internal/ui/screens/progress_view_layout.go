package screens

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// View renders the progress screen.
func (m ProgressModel) View() string {
	header := m.renderHeader()
	funnel := m.renderFunnel()
	scores := m.renderScoreDistribution()
	rates := m.renderRates()
	weekly := m.renderWeeklyActivity()
	help := m.renderHelp()

	// Combine panels
	body := lipgloss.JoinVertical(lipgloss.Left,
		funnel,
		"",
		scores,
		"",
		rates,
		"",
		weekly,
	)

	// Apply scroll
	bodyLines := strings.Split(body, "\n")
	offset := m.scrollOffset
	if offset >= len(bodyLines) {
		offset = len(bodyLines) - 1
	}
	if offset < 0 {
		offset = 0
	}
	if offset > 0 {
		bodyLines = bodyLines[offset:]
	}

	// Clamp to available height
	availHeight := m.height - 4 // header + help + padding
	if availHeight < 3 {
		availHeight = 3
	}
	if len(bodyLines) > availHeight {
		bodyLines = bodyLines[:availHeight]
	}

	body = strings.Join(bodyLines, "\n")

	return lipgloss.JoinVertical(lipgloss.Left, header, body, help)
}

func (m ProgressModel) renderHeader() string {
	style := lipgloss.NewStyle().
		Bold(true).
		Foreground(m.theme.Text).
		Background(m.theme.Surface).
		Width(m.width).
		Padding(0, 2)

	title := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Mauve).Render("SEARCH PROGRESS")

	right := lipgloss.NewStyle().Foreground(m.theme.Subtext)
	total := len(m.metrics.FunnelStages)
	totalCount := 0
	if total > 0 {
		totalCount = m.metrics.FunnelStages[0].Count
	}
	info := right.Render(fmt.Sprintf("%d evaluated | %.1f avg score", totalCount, m.metrics.AvgScore))

	gap := m.width - lipgloss.Width(title) - lipgloss.Width(info) - 4
	if gap < 1 {
		gap = 1
	}

	return style.Render(title + strings.Repeat(" ", gap) + info)
}

func (m ProgressModel) renderHelp() string {
	style := lipgloss.NewStyle().
		Foreground(m.theme.Subtext).
		Background(m.theme.Surface).
		Width(m.width).
		Padding(0, 1)

	keyStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Text)
	descStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

	brand := lipgloss.NewStyle().Foreground(m.theme.Overlay).Render("career-ops by santifer.io")

	keys := keyStyle.Render("\u2191\u2193") + descStyle.Render(" scroll  ") +
		keyStyle.Render("PgUp/Dn") + descStyle.Render(" page  ") +
		keyStyle.Render("Esc") + descStyle.Render(" back")

	gap := m.width - lipgloss.Width(keys) - lipgloss.Width(brand) - 2
	if gap < 1 {
		gap = 1
	}

	return style.Render(keys + strings.Repeat(" ", gap) + brand)
}
