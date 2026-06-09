export interface AgentGuidePrompt {
  icon: string;
  text: string;
  viewId: string;
}

export function AgentGuidePrompts({
  prompts,
  onSelectPrompt,
}: {
  prompts: AgentGuidePrompt[];
  onSelectPrompt(value: string): void;
}) {
  return (
    <div className="agent-guide-prompts" aria-label="引导问题">
      {prompts.map((prompt) => (
        <button type="button" key={prompt.text} onClick={() => onSelectPrompt(prompt.text)}>
          <span aria-hidden="true">{prompt.icon}</span>
          <strong>{prompt.text}</strong>
        </button>
      ))}
    </div>
  );
}
