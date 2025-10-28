
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function synthesizeSpeech(ssml: string, voiceName: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: ssml }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("API did not return audio data.");
    }
    
    return base64Audio;
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to synthesize speech: ${error.message}`);
    }
    throw new Error("An unknown error occurred during speech synthesis.");
  }
}
