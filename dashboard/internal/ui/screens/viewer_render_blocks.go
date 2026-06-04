package screens

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/table"
	"github.com/charmbracelet/x/ansi"
)

// renderAll converts every raw markdown line into visual terminal lines.
func (m ViewerModel) renderAll() []string {
	var styled []string
	i := 0
	for i < len(m.lines) {
		line := m.lines[i]
		trimmed := strings.TrimSpace(line)

		if trimmed == "" {
			styled = append(styled, "")
			i++
			continue
		}

		if isTableLine(line) {
			tableStart := i
			for i < len(m.lines) && isTableLine(m.lines[i]) {
				i++
			}
			styled = append(styled, m.renderTableBlock(m.lines[tableStart:i])...)
			continue
		}

		if strings.HasPrefix(trimmed, "```") {
			i++
			var codeLines []string
			for i < len(m.lines) {
				if strings.TrimSpace(m.lines[i]) == "```" {
					i++
					break
				}
				codeLines = append(codeLines, m.lines[i])
				i++
			}
			codeStyle := lipgloss.NewStyle().Background(m.theme.Surface).Foreground(m.theme.Text)
			w := m.width - 6
			if w < 10 {
				w = 10
			}
			for _, cl := range codeLines {
				for _, wl := range strings.Split(ansi.Wrap("  "+cl, w, ""), "\n") {
					styled = append(styled, codeStyle.Render(wl))
				}
			}
			continue
		}

		if isSpecialBlockLine(trimmed) {
			styled = append(styled, m.styleLine(line))
			i++
			continue
		}

		start := i
		for i < len(m.lines) {
			next := strings.TrimSpace(m.lines[i])
			if next == "" || isSpecialBlockLine(next) {
				break
			}
			i++
		}
		if i > start {
			paraLines := m.lines[start:i]
			para := strings.Join(paraLines, " ")
			w := m.width - 6
			if w < 10 {
				w = 10
			}
			wrapped := m.wrapParagraph(m.renderInlineElements(para), w)
			for _, wl := range wrapped {
				styled = append(styled, wl)
			}
		}
	}

	var flat []string
	for _, s := range styled {
		if strings.IndexByte(s, '\n') >= 0 {
			flat = append(flat, strings.Split(s, "\n")...)
		} else {
			flat = append(flat, s)
		}
	}
	return flat
}

func isTableLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return len(trimmed) > 1 && trimmed[0] == '|'
}

// isTableSeparator checks if a line is a table separator (|---|---|).
func isTableSeparator(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "|") {
		return false
	}
	cleaned := strings.NewReplacer("|", "", "-", "", ":", "", " ", "").Replace(trimmed)
	return cleaned == ""
}

// parseTableCells splits a table line into trimmed cells.
func parseTableCells(line string) []string {
	trimmed := strings.TrimSpace(line)
	// Remove leading and trailing pipes
	if len(trimmed) > 0 && trimmed[0] == '|' {
		trimmed = trimmed[1:]
	}
	if len(trimmed) > 0 && trimmed[len(trimmed)-1] == '|' {
		trimmed = trimmed[:len(trimmed)-1]
	}
	parts := strings.Split(trimmed, "|")
	cells := make([]string, len(parts))
	for i, p := range parts {
		cells[i] = strings.TrimSpace(p)
	}
	return cells
}

func detectAlignment(sep string) lipgloss.Position {
	s := strings.TrimSpace(sep)
	if strings.HasPrefix(s, ":") && strings.HasSuffix(s, ":") {
		return lipgloss.Center
	}
	if strings.HasSuffix(s, ":") {
		return lipgloss.Right
	}
	return lipgloss.Left
}

func (m ViewerModel) renderTableBlock(lines []string) []string {
	if len(lines) == 0 {
		return nil
	}

	var headers []string
	var dataRows [][]string
	var alignments []lipgloss.Position

	for _, line := range lines {
		if isTableSeparator(line) {
			if len(alignments) == 0 {
				for _, cell := range parseTableCells(line) {
					alignments = append(alignments, detectAlignment(cell))
				}
			}
			continue
		}
		cells := parseTableCells(line)
		rendered := make([]string, len(cells))
		for i, c := range cells {
			rendered[i] = m.renderInlineElements(c)
		}
		if headers == nil {
			headers = rendered
		} else {
			dataRows = append(dataRows, rendered)
		}
	}

	if len(headers) == 0 {
		var result []string
		for _, line := range lines {
			result = append(result, m.styleLine(line))
		}
		return result
	}

	w := m.width - 6
	if w < 10 {
		w = 10
	}

	borderStyle := lipgloss.NewStyle().Foreground(m.theme.Overlay)
	t := table.New().
		Width(w).
		Wrap(true).
		BorderStyle(borderStyle).
		BorderTop(true).BorderBottom(true).
		BorderLeft(true).BorderRight(true).
		BorderHeader(true).BorderColumn(true)

	t.Headers(headers...)
	if len(dataRows) > 0 {
		t.Rows(dataRows...)
	}

	t.StyleFunc(func(row, col int) lipgloss.Style {
		st := lipgloss.NewStyle().Padding(0, 1)
		if row == table.HeaderRow {
			return st.Bold(true).Foreground(m.theme.Sky)
		}
		if col < len(alignments) {
			st = st.Align(alignments[col])
		}
		return st.Foreground(m.theme.Text)
	})

	return strings.Split(t.String(), "\n")
}
