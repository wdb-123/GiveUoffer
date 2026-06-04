package screens

import (
	"github.com/santifer/career-ops/dashboard/internal/model"
	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ProgressClosedMsg is emitted when the progress screen is dismissed.
type ProgressClosedMsg struct{}

// ProgressModel implements the progress analytics screen.
type ProgressModel struct {
	metrics      model.ProgressMetrics
	scrollOffset int
	width        int
	height       int
	theme        theme.Theme
}

// NewProgressModel creates a new progress screen.
func NewProgressModel(t theme.Theme, metrics model.ProgressMetrics, width, height int) ProgressModel {
	return ProgressModel{
		metrics: metrics,
		width:   width,
		height:  height,
		theme:   t,
	}
}
