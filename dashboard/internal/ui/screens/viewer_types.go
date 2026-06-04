package screens

import (
	"os"
	"strings"

	"github.com/santifer/career-ops/dashboard/internal/theme"
)

// ViewerClosedMsg is emitted when the viewer is dismissed.
type ViewerClosedMsg struct{}

// ViewerModel implements an integrated file viewer screen.
type ViewerModel struct {
	lines         []string
	renderedLines []string
	title         string
	scrollOffset  int
	width         int
	height        int
	theme         theme.Theme
}

// NewViewerModel creates a new file viewer for the given path.
func NewViewerModel(t theme.Theme, path, title string, width, height int) ViewerModel {
	content, err := os.ReadFile(path)
	if err != nil {
		content = []byte("Error reading file: " + err.Error())
	}

	var lines []string
	if len(content) > 0 {
		lines = strings.Split(string(content), "\n")
	}

	m := ViewerModel{
		lines:  lines,
		title:  title,
		width:  width,
		height: height,
		theme:  t,
	}
	m.rebuildRender()
	return m
}
