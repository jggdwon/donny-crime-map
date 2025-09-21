import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 3001;

const logStream = fs.createWriteStream(path.join('server.log'), { flags: 'a' });

const log = (message) => {
    const timestamp = new Date().toISOString();
    logStream.write(`[${timestamp}] ${message}\n`);
    console.log(`[${timestamp}] ${message}`);
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
    log(`Request: ${req.method} ${req.url}`);
    next();
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, modelName, jsonResponse } = req.body;
    log(`Received /api/generate request with modelName: ${modelName} and jsonResponse: ${jsonResponse}`);
    log(`Prompt: ${prompt}`);

    if (!prompt) {
      log('Error: Prompt is required');
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const model = genAI.getGenerativeModel({ model: modelName || 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    log(`AI Raw Response: ${text}`);

    if (jsonResponse) {
        let jsonStr = text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
          jsonStr = match[2].trim();
        }
        try {
          const json = JSON.parse(jsonStr);
          log('Successfully parsed JSON response.');
          res.json({ json: json });
        } catch (e) {
          log(`Failed to parse JSON response: ${e}. Raw text: ${text}`);
          res.status(500).json({ error: "Failed to parse AI response as JSON." });
        }
    } else {
        log('Sending text response.');
        res.json({ text });
    }

  } catch (error) {
    log(`Error in /api/generate: ${error}`);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

app.listen(port, () => {
  log(`Server is running on http://localhost:${port}`);
});