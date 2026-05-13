export enum Role {
  USER = 'user',
  MODEL = 'model',
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  createdAt: string;
}

export interface Message {
  id?: string;
  role: Role;
  content: string;
  timestamp: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  source: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
