export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface Message {
  id?: string;
  role: Role;
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
  messages?: Message[];
}
