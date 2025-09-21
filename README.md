# Doncaster Crime Map

An advanced, real-time crime mapping and analysis tool for Doncaster, featuring AI-powered insights, predictive hotspots, and detailed incident data visualization.

This project uses a secure client-server architecture. The frontend (React) makes requests to a backend proxy (Node.js/Express) which securely handles the Gemini API key and communicates with the AI service.

## Local Development

**Prerequisites:** [Node.js](https://nodejs.org/)

1. Install dependencies:
   `npm install`
2. Create a `.env` file in the root directory.
3. Add your Gemini API key to the `.env` file:
   `GEMINI_API_KEY=your_api_key_here`
4. Run the development server:
   `npm run dev`

This will start the Vite frontend and the Express backend proxy concurrently.

## Deployment

This application is configured for deployment on a Linux VM (e.g., on Google Cloud Platform) using Nginx as a web server and PM2 as a process manager. The `GEMINI_API_KEY` must be set as an environment variable on the server.
