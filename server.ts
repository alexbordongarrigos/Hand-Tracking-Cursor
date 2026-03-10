import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Spawn python process
let pythonProcess = spawn('python3', [path.join(__dirname, 'mouse_controller.py')]);

pythonProcess.stdout.on('data', (data) => console.log(`Python: ${data.toString()}`));
pythonProcess.stderr.on('data', (data) => console.error(`Python Error: ${data.toString()}`));

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
});

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket for cursor control.');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log(`Received from client: ${data.type}`, data);
      const allowedTypes = ['move', 'click', 'mouse_down', 'mouse_up', 'scroll', 'volume', 'brightness', 'key', 'hotkey'];
      if (allowedTypes.includes(data.type)) {
        pythonProcess.stdin.write(JSON.stringify(data) + '\n');
      }
    } catch (e) {
      console.error('Invalid message from client', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Mouse Controller Backend listening on port ${PORT}`);
});
