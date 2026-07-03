import { type CSSProperties, useEffect, useRef } from "react";
import { AgentJourneyLine } from "./AgentJourneyLine";
import { AgentTurnView } from "./AgentTurnView";
import type { AgentChatMessage, AgentConversationTurn } from "./agentConversation";

interface AgentThreadStageProps {
  agentBusy: boolean;
  conversationKey: string;
  conversationTurns: AgentConversationTurn[];
  currentProcessMessages: AgentChatMessage[];
  executionStatusLabel: string;
  selectedTaskEventsCount: number;
  selectedTaskStatus?: string | undefined;
  selectedTaskTurnsCount: number;
  showCurrentProcess: boolean;
  visibleMessages: AgentChatMessage[];
  onOpenFilePreview(path: string): void | Promise<void>;
}

export function AgentThreadStage(props: AgentThreadStageProps) {
  const dialogueRef = useRef<HTMLDivElement | null>(null);
  const dialogueEndRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToLatestRef = useRef(true);
  const turnRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    shouldStickToLatestRef.current = true;
    scrollDialogueToLatest("auto");
  }, [props.conversationKey]);

  useEffect(() => {
    if (!shouldStickToLatestRef.current) return;
    scrollDialogueToLatest(props.agentBusy ? "auto" : "smooth");
  }, [
    props.agentBusy,
    props.visibleMessages.length,
    props.conversationTurns.length,
    props.selectedTaskStatus,
    props.selectedTaskEventsCount,
    props.selectedTaskTurnsCount,
  ]);

  function handleDialogueScroll() {
    const node = dialogueRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickToLatestRef.current = distanceFromBottom < 96;
  }

  function scrollDialogueToLatest(behavior: ScrollBehavior) {
    window.requestAnimationFrame(() => {
      const node = dialogueRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
      dialogueEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }

  function scrollToTurn(turnId: string) {
    const turnNode = turnRefs.current.get(turnId);
    turnNode?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="agent-thread-stage" key={props.conversationKey}>
      {props.visibleMessages.length ? (
        <div className="agent-dialogue" aria-live="polite" ref={dialogueRef} onScroll={handleDialogueScroll}>
          {props.conversationTurns.length > 1 ? (
            <AgentTurnJumpMarkers turns={props.conversationTurns} onJump={scrollToTurn} />
          ) : null}
          {props.conversationTurns.map((turn, index) => (
            <div
              className="agent-turn-anchor"
              key={turn.id}
              ref={(node) => {
                if (node) turnRefs.current.set(turn.id, node);
                else turnRefs.current.delete(turn.id);
              }}
            >
              <AgentTurnView
                turn={turn}
                runningProcessLabel={index === props.conversationTurns.length - 1 && props.showCurrentProcess ? props.executionStatusLabel : ""}
                runningProcessMessages={index === props.conversationTurns.length - 1 && props.showCurrentProcess ? props.currentProcessMessages : []}
                onOpenFilePreview={props.onOpenFilePreview}
              />
            </div>
          ))}
          <div className="agent-dialogue-end" ref={dialogueEndRef} aria-hidden="true" />
        </div>
      ) : (
        <div className="agent-empty-prompt">
          <div className="agent-brand-lockup" aria-label="Ucareer">
            <img className="agent-brand-wordmark" src="/assets/ucareer-primary-logo.svg" alt="" />
          </div>
          <h2>Your Journey. Your Career.</h2>
          <AgentJourneyLine className="agent-brand-path" />
        </div>
      )}
    </div>
  );
}

function AgentTurnJumpMarkers({
  turns,
  onJump,
}: {
  turns: Array<{ id: string; messages: AgentChatMessage[] }>;
  onJump(turnId: string): void;
}) {
  const centerIndex = (turns.length - 1) / 2;
  return (
    <nav className="agent-turn-jumpbar" aria-label="当前对话跳转">
      {turns.map((turn, index) => {
        const firstQuestion = turn.messages.find((message) => message.role === "user")?.text.replace(/\s+/g, " ").trim();
        const label = firstQuestion || `跳到第 ${index + 1} 轮问答`;
        const offset = Math.round((index - centerIndex) * 18);
        return (
          <button
            type="button"
            key={turn.id}
            aria-label={label}
            style={{ "--agent-turn-offset": `${offset}px` } as CSSProperties}
            onClick={() => onJump(turn.id)}
          >
            <span aria-hidden="true" />
            <small>{label}</small>
          </button>
        );
      })}
    </nav>
  );
}
