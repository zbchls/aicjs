const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GATEWAY = '127.0.0.1:18789';
const TOKEN = '3dd33442fb0a1fd55e5dde03286755df24bd4f45bf13f79f';

// 简单的消息队列
const pendingRequests = new Map();
let requestId = 0;

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

    // 处理 API 请求
    if (req.url === '/api/ask' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message, sessionId } = JSON.parse(body);
                const msgId = ++requestId;
                
                // 创建 WebSocket 客户端连接到 Gateway
                const WebSocket = require('ws');
                const ws = new WebSocket('ws://' + GATEWAY + '/ws');
                
                let response = '';
                let resolved = false;
                
                // 设置超时
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        ws.close();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            message: response || '请求超时，请重试',
                            sessionId: sessionId 
                        }));
                    }
                }, 30000);

                ws.on('open', () => {
                    // 认证
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "auth",
                        params: { token: TOKEN }
                    }));
                    
                    // 发送消息
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            jsonrpc: "2.2",
                            id: msgId,
                            method: "agent/run",
                            params: { 
                                message: message, 
                                channel: "webchat",
                                sessionId: sessionId
                            }
                        }));
                    }, 500);
                });

                ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        console.log('GW:', msg.id, msg.method || '');
                        
                        if (msg.method === 'agent:notify') {
                            const content = msg.params?.message?.content?.[0]?.text || 
                                           msg.params?.message || '';
                            response += content;
                            
                            // 实时发送部分响应
                            if (!resolved) {
                                // 继续等待完整响应
                            }
                        }
                    } catch (e) {}
                });

                ws.on('error', (error) => {
                    console.error('WS error:', error.message);
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            message: '连接失败: ' + error.message,
                            sessionId: sessionId 
                        }));
                    }
                });

                ws.on('close', () => {
                    console.log('WS closed, response:', response.substring(0, 100));
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            message: response || '暂无回复',
                            sessionId: sessionId 
                        }));
                    }
                });

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

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`QA Page: http://localhost:${PORT}/qa`);
    console.log(`API: http://localhost:${PORT}/api/ask`);
});
