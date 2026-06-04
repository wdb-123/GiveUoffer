package screens

import (
	tea "github.com/charmbracelet/bubbletea"
)

// Init implements tea.Model.
func (m ProgressModel) Init() tea.Cmd {
	return nil
}

// Resize updates dimensions.
func (m *ProgressModel) Resize(width, height int) {
	m.width = width
	m.height = height
}

// Update handles input for the progress screen.
func (m ProgressModel) Update(msg tea.Msg) (ProgressModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "esc":
			return m, func() tea.Msg { return ProgressClosedMsg{} }
		case "down", "j":
			m.scrollOffset++
		case "up", "k":
			if m.scrollOffset > 0 {
				m.scrollOffset--
			}
		case "pgdown", "ctrl+d":
			m.scrollOffset += m.height / 2
		case "pgup", "ctrl+u":
			m.scrollOffset -= m.height / 2
			if m.scrollOffset < 0 {
				m.scrollOffset = 0
			}
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}
	return m, nil
}
