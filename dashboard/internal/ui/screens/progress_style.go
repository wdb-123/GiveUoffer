package screens

import (
	"github.com/charmbracelet/lipgloss"
)

// rateColor returns a color based on the rate value.
func (m ProgressModel) rateColor(rate float64) lipgloss.Color {
	switch {
	case rate >= 30:
		return m.theme.Green
	case rate >= 15:
		return m.theme.Yellow
	case rate >= 5:
		return m.theme.Peach
	default:
		return m.theme.Red
	}
}
