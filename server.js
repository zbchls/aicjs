const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GATEWAY = '127.0.0.1:18789';
const TOKEN = '3dd33442fb0a1fd55e5dde03286755df24bd4f45bf13f79f';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

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

    res.writeHead(404);
    res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    console.log('Client connected');
    let gateway = null;
    let authDone = false;

    function connectGW() {
        gateway = new (require('ws'))('ws://' + GATEWAY + '/ws');
        
        gateway.on('open', () => {
            console.log('GW connected');
        });

        gateway.on('message', (data) => {
            const msg = data.toString();
            if (ws.readyState === 1) ws.send(msg);
        });

        gateway.on('close', () => {
            console.log('GW closed');
            gateway = null;
        });

        gateway.on('error', (err) => {
            console.log('GW error:', err.message);
        });
    }

    connectGW();

    ws.on('message', (data) => {
        const msg = data.toString();
        
        try {
            const parsed = JSON.parse(msg);
            
            // 处理认证响应
            if (parsed.type === 'response' && parsed.payload?.nonce) {
                // 转发到 Gateway
                if (gateway && gateway.readyState === 1) {
                    gateway.send(msg);
                }
                return;
            }
            
            // 认证消息
            if (parsed.method === 'auth') {
                // 替换 token
                parsed.params.token = TOKEN;
                if (gateway && gateway.readyState === 1) {
                    gateway.send(JSON.stringify(parsed));
                }
                return;
            }
            
            // 其他消息直接转发
            if (gateway && gateway.readyState === 1) {
                gateway.send(msg);
            }
        } catch (e) {
            // 直接转发
            if (gateway && gateway.readyState === 1) {
                gateway.send(msg);
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (gateway) gateway.close();
    });
});

server.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}/`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
