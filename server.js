const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GATEWAY = '127.0.0.1:18789';
const TOKEN = '3dd33442fb0a1fd55e5dde03286755df24bd4f45bf13f79f';

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve static files
    if (req.url === '/' || req.url === '/qa' || req.url === '/qa.html') {
        fs.readFile(path.join(__dirname, 'public', 'qa.html'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading page');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log('Client connected');
    
    let gatewayWs = null;

    // 连接到 Gateway
    function connectToGateway() {
        gatewayWs = new (require('ws'))('ws://' + GATEWAY + '/ws');
        
        gatewayWs.on('open', () => {
            console.log('Gateway connected');
        });

        gatewayWs.on('message', (data) => {
            // 转发给客户端
            if (ws.readyState === 1) {
                ws.send(data.toString());
            }
        });

        gatewayWs.on('error', (error) => {
            console.error('Gateway error:', error.message);
            ws.close();
        });

        gatewayWs.on('close', () => {
            console.log('Gateway closed');
        });
    }

    connectToGateway();

    ws.on('message', (data) => {
        // 转发到 Gateway
        if (gatewayWs && gatewayWs.readyState === 1) {
            gatewayWs.send(data.toString());
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (gatewayWs) {
            gatewayWs.close();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`QA Page: http://localhost:${PORT}/qa`);
});
