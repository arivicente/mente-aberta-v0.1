
import { GoogleGenAI } from "@google/genai";
import { Message, Specialist } from "../types";

// Função para obter a chave de forma segura sem quebrar o carregamento inicial
const getApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch (e) {
    return '';
  }
};

export const getAIResponse = async (
  specialist: Specialist,
  history: Message[],
  userInput: string
): Promise<string> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return "Configuração pendente: A chave de API do Gemini não foi detectada.";
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-3-flash-preview';
    
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: userInput }]
    });

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: specialist.systemPrompt,
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
      }
    });

    return response.text || "Desculpe, tive um problema ao processar sua resposta. Poderia repetir?";
  } catch (error) {
    console.error("AI Service Error:", error);
    return "Houve um erro técnico na nossa conversa. Por favor, tente novamente em instantes.";
  }
};
