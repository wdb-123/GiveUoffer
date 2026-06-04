package screens

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

func (m ProgressModel) renderFunnel() string {
	padStyle := lipgloss.NewStyle().Padding(0, 2)
	sectionTitle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)

	var lines []string
	lines = append(lines, padStyle.Render(sectionTitle.Render("Pipeline Funnel")))

	if len(m.metrics.FunnelStages) == 0 {
		dimStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
		lines = append(lines, padStyle.Render(dimStyle.Render("No data")))
		return strings.Join(lines, "\n")
	}

	// Find max count for bar scaling
	maxCount := 0
	for _, s := range m.metrics.FunnelStages {
		if s.Count > maxCount {
			maxCount = s.Count
		}
	}

	labelW := 10
	barMaxW := m.width - labelW - 20 // room for label, count, pct
	if barMaxW < 10 {
		barMaxW = 10
	}

	// Colors for funnel stages (gradient from cool to warm)
	stageColors := []lipgloss.Color{
		m.theme.Blue,
		m.theme.Sky,
		m.theme.Green,
		m.theme.Yellow,
		m.theme.Peach,
	}

	for i, stage := range m.metrics.FunnelStages {
		barW := 0
		if maxCount > 0 {
			barW = stage.Count * barMaxW / maxCount
		}
		if barW < 1 && stage.Count > 0 {
			barW = 1
		}

		color := m.theme.Text
		if i < len(stageColors) {
			color = stageColors[i]
		}

		barStyle := lipgloss.NewStyle().Foreground(color)
		labelStyle := lipgloss.NewStyle().Foreground(m.theme.Text).Width(labelW)
		countStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

		bar := barStyle.Render(strings.Repeat("\u2588", barW))
		label := labelStyle.Render(stage.Label)

		pctStr := ""
		if i > 0 {
			pctStr = fmt.Sprintf(" (%.0f%%)", stage.Pct)
		}
		count := countStyle.Render(fmt.Sprintf("  %d%s", stage.Count, pctStr))

		lines = append(lines, padStyle.Render(label+bar+count))
	}

	return strings.Join(lines, "\n")
}

func (m ProgressModel) renderScoreDistribution() string {
	padStyle := lipgloss.NewStyle().Padding(0, 2)
	sectionTitle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)

	var lines []string
	lines = append(lines, padStyle.Render(sectionTitle.Render("Score Distribution")))

	if len(m.metrics.ScoreBuckets) == 0 {
		dimStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
		lines = append(lines, padStyle.Render(dimStyle.Render("No data")))
		return strings.Join(lines, "\n")
	}

	// Find max count for bar scaling
	maxCount := 0
	for _, b := range m.metrics.ScoreBuckets {
		if b.Count > maxCount {
			maxCount = b.Count
		}
	}

	labelW := 8
	barMaxW := m.width - labelW - 14
	if barMaxW < 10 {
		barMaxW = 10
	}

	// Colors for score ranges (green to red)
	bucketColors := []lipgloss.Color{
		m.theme.Green,
		m.theme.Green,
		m.theme.Yellow,
		m.theme.Peach,
		m.theme.Red,
	}

	for i, bucket := range m.metrics.ScoreBuckets {
		barW := 0
		if maxCount > 0 {
			barW = bucket.Count * barMaxW / maxCount
		}
		if barW < 1 && bucket.Count > 0 {
			barW = 1
		}

		color := m.theme.Text
		if i < len(bucketColors) {
			color = bucketColors[i]
		}

		barStyle := lipgloss.NewStyle().Foreground(color)
		labelStyle := lipgloss.NewStyle().Foreground(m.theme.Text).Width(labelW)
		countStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

		bar := barStyle.Render(strings.Repeat("\u2588", barW))
		label := labelStyle.Render(bucket.Label)
		count := countStyle.Render(fmt.Sprintf("  %d", bucket.Count))

		lines = append(lines, padStyle.Render(label+bar+count))
	}

	return strings.Join(lines, "\n")
}

func (m ProgressModel) renderRates() string {
	padStyle := lipgloss.NewStyle().Padding(0, 2)
	sectionTitle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)

	var lines []string
	lines = append(lines, padStyle.Render(sectionTitle.Render("Conversion Rates")))

	labelStyle := lipgloss.NewStyle().Foreground(m.theme.Text)
	valueStyle := lipgloss.NewStyle().Bold(true)
	sepStyle := lipgloss.NewStyle().Foreground(m.theme.Overlay)

	responseColor := m.rateColor(m.metrics.ResponseRate)
	interviewColor := m.rateColor(m.metrics.InterviewRate)
	offerColor := m.rateColor(m.metrics.OfferRate)

	sep := sepStyle.Render("  |  ")

	rates := labelStyle.Render("Response Rate: ") +
		valueStyle.Foreground(responseColor).Render(fmt.Sprintf("%.1f%%", m.metrics.ResponseRate)) +
		sep +
		labelStyle.Render("Interview Rate: ") +
		valueStyle.Foreground(interviewColor).Render(fmt.Sprintf("%.1f%%", m.metrics.InterviewRate)) +
		sep +
		labelStyle.Render("Offer Rate: ") +
		valueStyle.Foreground(offerColor).Render(fmt.Sprintf("%.1f%%", m.metrics.OfferRate))

	lines = append(lines, padStyle.Render(rates))

	// Active summary
	dimStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
	activeInfo := dimStyle.Render(fmt.Sprintf(
		"%d active applications | %d total offers",
		m.metrics.ActiveApps, m.metrics.TotalOffers,
	))
	lines = append(lines, padStyle.Render(activeInfo))

	return strings.Join(lines, "\n")
}

func (m ProgressModel) renderWeeklyActivity() string {
	padStyle := lipgloss.NewStyle().Padding(0, 2)
	sectionTitle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky)

	var lines []string
	lines = append(lines, padStyle.Render(sectionTitle.Render("Weekly Activity")))

	if len(m.metrics.WeeklyActivity) == 0 {
		dimStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)
		lines = append(lines, padStyle.Render(dimStyle.Render("No data")))
		return strings.Join(lines, "\n")
	}

	// Find max count for bar scaling
	maxCount := 0
	for _, w := range m.metrics.WeeklyActivity {
		if w.Count > maxCount {
			maxCount = w.Count
		}
	}

	labelW := 10
	barMaxW := m.width - labelW - 12
	if barMaxW < 10 {
		barMaxW = 10
	}

	for _, week := range m.metrics.WeeklyActivity {
		barW := 0
		if maxCount > 0 {
			barW = week.Count * barMaxW / maxCount
		}
		if barW < 1 && week.Count > 0 {
			barW = 1
		}

		barStyle := lipgloss.NewStyle().Foreground(m.theme.Blue)
		labelStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext).Width(labelW)
		countStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext)

		// Show short week label (e.g., "W14" from "2026-W14")
		shortWeek := week.Week
		if idx := strings.Index(shortWeek, "-"); idx >= 0 {
			shortWeek = shortWeek[idx+1:]
		}

		bar := barStyle.Render(strings.Repeat("\u2588", barW))
		label := labelStyle.Render(shortWeek)
		count := countStyle.Render(fmt.Sprintf("  %d", week.Count))

		lines = append(lines, padStyle.Render(label+bar+count))
	}

	return strings.Join(lines, "\n")
}
