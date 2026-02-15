
import { GoogleGenAI } from "@google/genai";
import { Message, Specialist } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getAIResponse = async (
  specialist: Specialist,
  history: Message[],
  userInput: string
): Promise<string> => {
  try {
    // Current implementation uses Gemini as the primary provider
    const model = 'gemini-3-flash-preview';
    
    // Format history for Gemini
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Add current user input
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
