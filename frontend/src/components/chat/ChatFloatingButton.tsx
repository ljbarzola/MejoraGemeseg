interface ChatFloatingButtonProps {
  onClick: () => void;
}

export default function ChatFloatingButton({ onClick }: ChatFloatingButtonProps) {
  return (
    <button className="chat-fab" onClick={onClick} title="Abrir asistente">
      <span className="chat-fab-icon">💬</span>
    </button>
  );
}
