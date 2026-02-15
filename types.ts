
export type SpecialistId = 'freud' | 'jung' | 'beck';

export interface Specialist {
  id: SpecialistId;
  name: string;
  approach: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
  avatar: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface ChatHistory {
  [key: string]: Message[];
}

export enum AIProvider {
  GEMINI = 'gemini',
  OPENAI = 'openai' // Placeholder for future extensibility
}
