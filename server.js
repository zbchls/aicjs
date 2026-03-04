const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const https = require('https');
const http2 = require('http2');

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

    // Handle ask endpoint (HTTP polling fallback)
    if (req.url === '/api/ask' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message } = JSON.parse(body);
                
                // 通过 WebSocket 发送并等待回复
                const response = await sendViaGateway(message);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

// WebSocket server
const wss = new WebSocketServer({ server });

// 存储活跃的客户端连接
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = Date.now();
    console.log('Client connected:', clientId);
    
    let gatewayWs = null;
    let authenticated = false;

    // 连接到 Gateway
    function connectToGateway() {
        gatewayWs = new (require('ws'))('ws://' + GATEWAY + '/ws');
        
        gatewayWs.on('open', () => {
            console.log('Gateway connected');
            // 认证
            gatewayWs.send(JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "auth",
                params: { token: TOKEN }
            }));
        });

        gatewayWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                console.log('Gateway:', msg.id, msg.method || msg.result ? 'response' : 'notify');
                
                // 转发给客户端
                if (ws.readyState === 1) {
                    ws.send(data.toString());
                }
            } catch (e) {
                console.log('Gateway raw:', data.toString());
            }
        });

        gatewayWs.on('error', (error) => {
            console.error('Gateway error:', error.message);
            ws.close();
        });

        gatewayWs.on('close', () => {
            console.log('Gateway closed');
            ws.close();
        });
    }

    connectToGateway();

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            console.log('Client:', msg.id, msg.method);
            
            if (msg.method === 'auth') {
                authenticated = true;
            }
            
            // 转发到 Gateway
            if (gatewayWs && gatewayWs.readyState === 1) {
                gatewayWs.send(data.toString());
            }
        } catch (e) {
            console.error('Parse error:', e);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        if (gatewayWs) {
            gatewayWs.close();
        }
    });
});

// 通过 Gateway 发送消息并等待回复
function sendViaGateway(message) {
    return new Promise((resolve, reject) => {
        const gatewayWs = new (require('ws'))('ws://' + GATEWAY + '/ws');
        const msgId = Date.now();
        let response = '';
        let resolved = false;

        gatewayWs.on('open', () => {
            // 认证
            gatewayWs.send(JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "auth",
                params: { token: TOKEN }
            }));

            // 发送消息
            setTimeout(() => {
                gatewayWs.send(JSON.stringify({
                    jsonrpc: "2.0",
                    id: msgId,
                    method: "agent/run",
                    params: { message, channel: "webchat" }
                }));
            }, 500);
        });

        gatewayWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                
                if (msg.method === 'agent:notify') {
                    const content = msg.params?.message?.content?.[0]?.text || 
                                   msg.params?.message || '';
                    response += content;
                }
            } catch (e) {}
        });

        // 5秒超时
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                gatewayWs.close();
                resolve(response || '请求超时');
            }
        }, 15000);
    });
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`QA Page: http://localhost:${PORT}/qa`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
