const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GATEWAY = '127.0.0.1:18789';

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

    // Proxy API requests (including WebSocket upgrade)
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        const targetPath = req.url.startsWith('/api') ? req.url.replace('/api', '') : req.url;
        const targetPort = req.url.startsWith('/ws') ? 18789 : 18789;
        
        const options = {
            hostname: GATEWAY,
            port: targetPort,
            path: targetPath,
            method: req.method,
            headers: {
                ...req.headers,
                'Host': GATEWAY
            }
        };

        if (req.url.startsWith('/ws')) {
            // For WebSocket, we need to handle upgrade
            const proxy = http.request(options, (proxyRes) => {
                // Just acknowledge - actual WS upgrade happens differently
            });
            
            req.pipe(proxy);
            proxy.on('error', (e) => {
                console.error('Proxy error:', e.message);
            });
            return;
        }

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        req.pipe(proxyReq);
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

// Create WebSocket server for proxying
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    // Connect to Gateway
    const gatewayWs = new (require('ws'))('ws://' + GATEWAY + '/ws');

    gatewayWs.on('open', () => {
        console.log('Connected to Gateway');
        ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 0, method: "auth", 
            params: { token: "3dd33442fb0a1fd55e5dde03286755df24bd4f45bf13f79f" }
        }));
    });

    gatewayWs.on('message', (data) => {
        ws.send(data.toString());
    });

    gatewayWs.on('error', (error) => {
        console.error('Gateway WS error:', error.message);
        ws.close();
    });

    ws.on('message', (data) => {
        if (gatewayWs.readyState === 1) {
            gatewayWs.send(data.toString());
        }
    });

    ws.on('close', () => {
        gatewayWs.close();
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`QA Page: http://localhost:${PORT}/qa`);
    console.log(`WebSocket proxy: ws://localhost:${PORT}/ws`);
});
