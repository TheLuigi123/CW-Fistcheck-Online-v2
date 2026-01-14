import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generatePracticeText = async (type: 'callsigns' | 'qso' | 'words', userCallsign?: string): Promise<string> => {
  const client = getClient();
  if (!client) return "ERROR: API Key not found.";

  let prompt = "";
  if (type === 'callsigns') {
    prompt = "Generate a list of 10 random amateur radio callsigns separated by spaces. Do not include any other text.";
  } else if (type === 'qso') {
    const callsignCtx = userCallsign ? ` Use the callsign "${userCallsign}" for one of the stations.` : "";
    prompt = `Generate a realistic amateur radio CW (Morse code) QSO script.${callsignCtx} Do not include speaker labels (like 'Station A:'). Start with 'CQ CQ'. Use standard CW abbreviations (e.g. TNX, UR, RST, QTH). End each transmission with 'K', 'AR' or 'SK'. Keep it under 60 words. Format as plain text lines.`;
  } else {
    prompt = "Generate 10 random common english words for Morse code practice, separated by spaces.";
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Failed to generate text.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating text. Please check API configuration.";
  }
};