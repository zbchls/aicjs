const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GATEWAY = 'http://127.0.0.1:18789';

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

    // Proxy WebSocket connections
    if (req.url.startsWith('/ws')) {
        const targetUrl = GATEWAY + '/ws';
        
        // For HTTP proxy, we need to upgrade to WebSocket
        // This is a simplified version - for production, use ws module
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WebSocket endpoint. Connect directly to: ' + GATEWAY + '/ws');
        return;
    }

    // Proxy API requests
    if (req.url.startsWith('/api')) {
        const targetPath = req.url.replace('/api', '');
        
        const options = {
            hostname: '127.0.0.1',
            port: 18789,
            path: targetPath,
            method: req.method,
            headers: {
                ...req.headers,
                'Host': '127.0.0.1:18789'
            }
        };

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

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`QA Page: http://localhost:${PORT}/qa`);
});
