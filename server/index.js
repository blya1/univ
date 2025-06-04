require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

// Set up CORS
app.use(cors({
    origin: '*', // TODO: Replace with specific domains for production
}));

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Serve exam.html for the /exam route
app.get('/exam', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/exam.html'));
});

const server = app.listen(process.env.PORT || 8080, () => {
    console.log('Server started on port', server.address().port);
});
const wss = new WebSocket.Server({ server });

// Store active clients, their data, and authenticated tokens
const clients = new Map();
const activeScreenshots = new Map(); // Хранит скриншоты и ответы
const authenticatedTokens = new Set();

// Predefined admin credentials
const users = [
    {
        username: 'admin',
        passwordHash: '$2b$10$rmDgt6JvnOC7VuNrdur1LeuJIVGd9U3Vl46cCGwChA.tkdfOcYBoC'
    },
    {
        username: 'xuy',
        passwordHash: '$2b$10$ygPmBis8/mS7EUkvulhSiuZFLKQ5TNgSWxEcxmzntLXzvNhEwF.CS'
    }
];

// Генерация простого токена
function generateToken() {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

wss.on('connection', ws => {
    console.log('server/index.js: Client connected');

    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(clientId, { ws, role: null, lastActive: Date.now() });
    ws.clientId = clientId;

    // Send ping every 30 seconds
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
            clients.get(clientId).lastActive = Date.now();
        }
    }, 30000);

    ws.on('pong', () => {
        clients.get(clientId).lastActive = Date.now();
    });

    ws.on('message', async message => {
        console.log('server/index.js: Received message:', message.toString());

        try {
            const parsedMessage = JSON.parse(message);

            // Handle login
            if (parsedMessage.type === 'login') {
                const { username, password } = parsedMessage;
                const user = users.find(u => u.username === username);
                if (user) {
                    const isMatch = await bcrypt.compare(password, user.passwordHash);
                    if (isMatch) {
                        const token = generateToken();
                        authenticatedTokens.add(token);
                        ws.send(JSON.stringify({
                            type: 'loginResponse',
                            success: true,
                            token
                        }));
                        console.log(`server/index.js: User ${username} logged in successfully`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'loginResponse',
                            success: false
                        }));
                        console.log(`server/index.js: Invalid password for user ${username}`);
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'loginResponse',
                        success: false
                    }));
                    console.log(`server/index.js: User ${username} not found`);
                }
                return;
            }

            // Handle token verification
            if (parsedMessage.type === 'verifyToken') {
                const { token } = parsedMessage;
                const isValid = authenticatedTokens.has(token);
                console.log(`server/index.js: Verifying token ${token}: ${isValid}`);
                ws.send(JSON.stringify({
                    type: 'verifyTokenResponse',
                    success: isValid
                }));
                return;
            }

            // Register client role
            if (parsedMessage.role) {
                clients.get(clientId).role = parsedMessage.role;
                console.log(`server/index.js: Client ${clientId} registered as ${parsedMessage.role}`);

                if (parsedMessage.role === 'exam') {
                    // Send all active screenshots to the exam client
                    const screenshots = [];
                    activeScreenshots.forEach((clientScreenshots, cId) => {
                        clientScreenshots.forEach(screenshot => {
                            screenshots.push({
                                clientId: cId,
                                questionId: screenshot.questionId,
                                screenshot: screenshot.screenshot,
                                answer: screenshot.answer || null // Включаем ответы, если есть
                            });
                        });
                    });
                    console.log('server/index.js: Sending initialState to exam client:', screenshots);
                    ws.send(JSON.stringify({ type: 'initialState', screenshots }));
                }
                return;
            }

            // Handle screenshot from helper
            if (parsedMessage.type === 'screenshot' && clients.get(clientId).role === 'helper') {
                parsedMessage.clientId = clientId;
                console.log('server/index.js: Processing screenshot from helper:', parsedMessage);

                if (!activeScreenshots.has(clientId)) {
                    activeScreenshots.set(clientId, []);
                }
                const screenshotData = {
                    questionId: parsedMessage.questionId,
                    screenshot: parsedMessage.screenshot,
                    answer: null // Инициализируем answer как null
                };
                activeScreenshots.get(clientId).push(screenshotData);

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && clients.get(client.clientId).role === 'exam') {
                        console.log('server/index.js: Forwarding screenshot to exam client:', client.clientId);
                        client.send(JSON.stringify(parsedMessage));
                    }
                });
            }

            // Handle answer from exam
            if (parsedMessage.type === 'answer' && clients.get(clientId).role === 'exam') {
                console.log('server/index.js: Processing answer from exam:', parsedMessage);
                // Сохраняем ответ в activeScreenshots
                activeScreenshots.forEach((screenshots, cId) => {
                    screenshots.forEach(s => {
                        if (s.questionId === parsedMessage.questionId && cId === parsedMessage.clientId) {
                            s.answer = parsedMessage.answer;
                            console.log('server/index.js: Saved answer for questionId:', s.questionId);
                        }
                    });
                });

                const targetClient = clients.get(parsedMessage.clientId);
                if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                    console.log('server/index.js: Sending answer to helper:', parsedMessage.clientId);
                    targetClient.ws.send(JSON.stringify(parsedMessage));
                }

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && clients.get(client.clientId).role === 'exam') {
                        console.log('server/index.js: Broadcasting answer to exam client:', client.clientId);
                        client.send(JSON.stringify({
                            type: 'answer',
                            questionId: parsedMessage.questionId,
                            answer: parsedMessage.answer,
                            clientId: parsedMessage.clientId,
                            answeredBy: parsedMessage.answeredBy
                        }));
                    }
                });
            }
        } catch (e) {
            console.error('server/index.js: JSON parse error:', e.message, e.stack);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        console.log('server/index.js: Client disconnected:', clientId);
        clearInterval(pingInterval);
        const client = clients.get(clientId);

        if (client && client.role === 'helper') {
            activeScreenshots.delete(clientId);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && clients.get(client.clientId).role === 'exam') {
                    console.log('server/index.js: Notifying exam clients of disconnection:', client.clientId);
                    client.send(JSON.stringify({ type: 'clientDisconnected', clientId }));
                }
            });
        }

        clients.delete(clientId);
    });

    // Check for inactive clients every 30 seconds
    setInterval(() => {
        clients.forEach((client, id) => {
            const inactiveTime = (Date.now() - client.lastActive) / 1000;
            if (inactiveTime > 60 && client.ws.readyState !== WebSocket.OPEN) {
                console.log(`server/index.js: Client ${id} inactive for ${inactiveTime}s, removing`);
                if (client.role === 'helper') {
                    activeScreenshots.delete(id);
                    wss.clients.forEach(otherClient => {
                        if (otherClient.readyState === WebSocket.OPEN && clients.get(otherClient.clientId).role === 'exam') {
                            console.log('server/index.js: Notifying exam clients of inactive client:', id);
                            otherClient.send(JSON.stringify({ type: 'clientDisconnected', clientId: id }));
                        }
                    });
                }
                clients.delete(id);
            }
        });
    }, 30000);
});

console.log('server/index.js: WebSocket server started');