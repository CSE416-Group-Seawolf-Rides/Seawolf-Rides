export interface ChatThread {
  id: string;
  participantIds: string[];
  names: Record<string, string>;
  localDate: string;
  campusLabel: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
}
export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  sentAt: number;
  sequence: number;
}
export const chatPartner = (thread: ChatThread, uid: string) =>
  thread.participantIds.find((id) => id !== uid) ?? '';
