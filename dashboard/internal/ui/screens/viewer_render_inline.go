package screens

import (
	"regexp"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

var (
	reBold       = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	reLink       = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	reBareURL    = regexp.MustCompile(`https?://\S*[^\s\)\]\.,;:!?]`)
	reInlineCode = regexp.MustCompile("`([^`]+)`")
	reListNumber = regexp.MustCompile(`^(\s*\d+\.\s+)(.*)$`)
)

func isHeadingLine(line string) bool {
	return strings.HasPrefix(line, "# ") ||
		strings.HasPrefix(line, "## ") ||
		strings.HasPrefix(line, "### ") ||
		strings.HasPrefix(line, "#### ") ||
		strings.HasPrefix(line, "##### ") ||
		strings.HasPrefix(line, "###### ")
}

func isSpecialBlockLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return isHeadingLine(trimmed) ||
		trimmed == "---" || trimmed == "***" ||
		strings.HasPrefix(trimmed, "> ") ||
		strings.HasPrefix(trimmed, "|") ||
		strings.HasPrefix(trimmed, "```") ||
		strings.HasPrefix(trimmed, "- ") ||
		strings.HasPrefix(trimmed, "* ") ||
		reListNumber.MatchString(trimmed) ||
		(strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**"))
}

func (m ViewerModel) wrapParagraph(text string, width int) []string {
	if width <= 0 {
		return []string{text}
	}
	wrapped := ansi.Wrap(text, width, "")
	return strings.Split(wrapped, "\n")
}

func (m ViewerModel) renderInlineElements(line string) string {
	return m.renderInlineElementsAs(line, m.theme.Subtext)
}

// renderInlineElementsAs walks the raw line once and reapplies baseColor around
// every plain-text span, so resets emitted by inline tokens (code, bold, link,
// bare URL) don't leak through to subsequent text.
func (m ViewerModel) renderInlineElementsAs(line string, baseColor lipgloss.Color) string {
	baseStyle := lipgloss.NewStyle().Foreground(baseColor)
	codeStyle := lipgloss.NewStyle().Background(m.theme.Surface).Foreground(m.theme.Text)
	boldStyle := lipgloss.NewStyle().Bold(true).Foreground(m.theme.Yellow)
	linkStyle := lipgloss.NewStyle().Foreground(m.theme.Blue)

	var b strings.Builder
	rest := line
	for rest != "" {
		match := findInlineMatch(rest, codeStyle, boldStyle, linkStyle)
		if match == nil {
			b.WriteString(baseStyle.Render(rest))
			break
		}
		if match.start > 0 {
			b.WriteString(baseStyle.Render(rest[:match.start]))
		}
		b.WriteString(match.rendered)
		rest = rest[match.end:]
	}
	return b.String()
}

type inlineMatch struct {
	start, end int
	rendered   string
}

func findInlineMatch(s string, codeStyle, boldStyle, linkStyle lipgloss.Style) *inlineMatch {
	var best *inlineMatch
	consider := func(loc []int, rendered func() string) {
		if loc == nil || (best != nil && loc[0] >= best.start) {
			return
		}
		best = &inlineMatch{start: loc[0], end: loc[1], rendered: rendered()}
	}

	if loc := reInlineCode.FindStringIndex(s); loc != nil {
		consider(loc, func() string { return codeStyle.Render(s[loc[0]+1 : loc[1]-1]) })
	}
	if loc := reBold.FindStringIndex(s); loc != nil {
		consider(loc, func() string { return boldStyle.Render(s[loc[0]+2 : loc[1]-2]) })
	}
	if loc := reLink.FindStringIndex(s); loc != nil {
		consider(loc, func() string {
			sm := reLink.FindStringSubmatch(s[loc[0]:loc[1]])
			if len(sm) >= 2 {
				return linkStyle.Render(sm[1])
			}
			return s[loc[0]:loc[1]]
		})
	}
	if loc := reBareURL.FindStringIndex(s); loc != nil {
		consider(loc, func() string { return linkStyle.Render(s[loc[0]:loc[1]]) })
	}
	return best
}

func (m ViewerModel) styleLine(line string) string {
	trimmed := strings.TrimSpace(line)
	w := m.width - 6
	if w < 10 {
		w = 10
	}

	if strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "## ") {
		content := strings.TrimPrefix(trimmed, "# ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Blue).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "## ") && !strings.HasPrefix(trimmed, "### ") {
		content := strings.TrimPrefix(trimmed, "## ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Mauve).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "### ") && !strings.HasPrefix(trimmed, "#### ") {
		content := strings.TrimPrefix(trimmed, "### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Sky).Width(w).Render("  " + content)
	}
	if strings.HasPrefix(trimmed, "#### ") && !strings.HasPrefix(trimmed, "##### ") {
		content := strings.TrimPrefix(trimmed, "#### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Subtext).Width(w).Render("    " + content)
	}
	if strings.HasPrefix(trimmed, "##### ") && !strings.HasPrefix(trimmed, "###### ") {
		content := strings.TrimPrefix(trimmed, "##### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Overlay).Width(w).Render("      " + content)
	}
	if strings.HasPrefix(trimmed, "###### ") {
		content := strings.TrimPrefix(trimmed, "###### ")
		return lipgloss.NewStyle().Bold(true).Foreground(m.theme.Overlay).Width(w).Render("        " + content)
	}
	if trimmed == "---" || trimmed == "***" {
		return lipgloss.NewStyle().Foreground(m.theme.Overlay).Width(w).Render(strings.Repeat("─", w))
	}
	if strings.HasPrefix(trimmed, "> ") {
		content := strings.TrimPrefix(trimmed, "> ")
		border := lipgloss.NewStyle().Foreground(m.theme.Overlay).Render("▎ ")
		textStyle := lipgloss.NewStyle().Foreground(m.theme.Subtext).Italic(true)
		wrapped := strings.Split(ansi.Wrap(textStyle.Render(content), w-2, ""), "\n")
		result := make([]string, 0, len(wrapped))
		for i, line := range wrapped {
			if i == 0 {
				result = append(result, border+line)
			} else {
				result = append(result, strings.Repeat(" ", ansi.StringWidth(border))+line)
			}
		}
		return strings.Join(result, "\n")
	}
	if strings.HasPrefix(trimmed, "**") && strings.Contains(trimmed, ":**") {
		styled := m.renderInlineElements(line)
		return ansi.Wrap(styled, w, "")
	}
	if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
		content := trimmed[2:]
		marker := lipgloss.NewStyle().Foreground(m.theme.Blue).Render("• ")
		return m.renderListItem(marker, content, w)
	}
	if reListNumber.MatchString(trimmed) {
		sm := reListNumber.FindStringSubmatch(trimmed)
		if len(sm) >= 3 {
			marker := lipgloss.NewStyle().Foreground(m.theme.Blue).Render(sm[1])
			return m.renderListItem(marker, sm[2], w)
		}
	}

	styled := m.renderInlineElementsAs(trimmed, m.theme.Subtext)
	return ansi.Wrap(styled, w, "")
}

func (m ViewerModel) renderListItem(marker, content string, width int) string {
	markerWidth := ansi.StringWidth(marker)
	textWidth := width - markerWidth
	if textWidth < 10 {
		textWidth = 10
	}
	styled := m.renderInlineElementsAs(content, m.theme.Text)
	lines := strings.Split(ansi.Wrap(styled, textWidth, ""), "\n")
	result := make([]string, 0, len(lines))
	for i, line := range lines {
		if i == 0 {
			result = append(result, marker+line)
		} else {
			result = append(result, strings.Repeat(" ", markerWidth)+line)
		}
	}
	return strings.Join(result, "\n")
}
