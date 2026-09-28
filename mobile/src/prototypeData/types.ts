export interface ChatPreview {
  id: string;
  participantName: string;
  commuteLabel: string;
  lastMessage: string;
  timestamp: string;
}

export interface PrototypeChatMessage {
  id: string;
  sender: 'me' | 'them';
  text: string;
  timestamp: string;
}

export interface PrototypeConversation {
  preview: ChatPreview;
  messages: PrototypeChatMessage[];
  // The match this chat belongs to. Chats with no match are the demo user's history.
  offerId?: string;
  riderId?: string;
}
