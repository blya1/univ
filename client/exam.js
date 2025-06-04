let socket;
let token;

function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authMessage = document.getElementById('auth-message');

    socket = new WebSocket('wss://univ-8ebo.onrender.com/');

    socket.onopen = () => {
        console.log('exam.js: WebSocket connected');
        socket.send(JSON.stringify({ type: 'login', username, password }));
    };

    socket.onmessage = (event) => {
        try {
            const response = JSON.parse(event.data);
            console.log('exam.js: Received:', response);

            if (response.type === 'loginResponse') {
                if (response.success) {
                    token = response.token;
                    document.getElementById('login-section').style.display = 'none';
                    document.getElementById('exam-section').style.display = 'block';
                    socket.send(JSON.stringify({ role: 'exam' }));
                    verifyToken();
                } else {
                    authMessage.textContent = 'Неверное имя пользователя или пароль';
                }
            } else if (response.type === 'verifyTokenResponse') {
                if (!response.success) {
                    logout();
                }
            } else if (response.type === 'initialState') {
                updateClients(response.screenshots);
            } else if (response.type === 'screenshot') {
                addScreenshot(response.clientId, response.questionId, response.screenshot);
            } else if (response.type === 'answer') {
                updateAnswer(response.clientId, response.questionId, response.answer);
            } else if (response.type === 'clientDisconnected') {
                removeClient(response.clientId);
            } else if (response.type === 'pageHTML') {
                displayPageHTML(response.clientId, response.html);
            }
        } catch (e) {
            console.error('exam.js: Error parsing message:', e);
        }
    };

    socket.onerror = (error) => {
        console.error('exam.js: WebSocket error:', error);
    };

    socket.onclose = () => {
        console.log('exam.js: WebSocket closed');
        logout();
    };
}

function verifyToken() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'verifyToken', token }));
    }
}

function logout() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('exam-section').style.display = 'none';
    document.getElementById('auth-message').textContent = '';
    document.getElementById('clients').innerHTML = '';
    document.getElementById('html-sections').innerHTML = '';
    if (socket) {
        socket.close();
    }
}

function updateClients(screenshots) {
    const clientsDiv = document.getElementById('clients');
    clientsDiv.innerHTML = '';
    const clientMap = new Map();

    screenshots.forEach(s => {
        if (!clientMap.has(s.clientId)) {
            clientMap.set(s.clientId, []);
        }
        clientMap.get(s.clientId).push(s);
    });

    clientMap.forEach((screenshots, clientId) => {
        const clientSection = document.createElement('div');
        clientSection.className = 'client-section';
        clientSection.innerHTML = `
            <div class="client-header">
                <button onclick="toggleQuestions('${clientId}')">Клиент ${clientId}</button>
            </div>
            <div class="questions" id="questions-${clientId}">
                ${screenshots.map(s => `
                    <div class="question" data-question-id="${s.questionId}">
                        <img src="${s.screenshot}" alt="Скриншот">
                        <div class="answer-input">
                            <input type="text" placeholder="Введите ответ" value="${s.answer || ''}">
                            <button onclick="sendAnswer('${clientId}', '${s.questionId}', this)">Отправить</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        clientsDiv.appendChild(clientSection);
    });
}

function toggleQuestions(clientId) {
    const questions = document.getElementById(`questions-${clientId}`);
    questions.classList.toggle('visible');
}

function addScreenshot(clientId, questionId, screenshot) {
    let clientSection = document.querySelector(`.client-section:has(#questions-${clientId})`);
    if (!clientSection) {
        clientSection = document.createElement('div');
        clientSection.className = 'client-section';
        clientSection.innerHTML = `
            <div class="client-header">
                <button onclick="toggleQuestions('${clientId}')">Клиент ${clientId}</button>
            </div>
            <div class="questions" id="questions-${clientId}"></div>
        `;
        document.getElementById('clients').appendChild(clientSection);
    }

    const questions = document.getElementById(`questions-${clientId}`);
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question';
    questionDiv.dataset.questionId = questionId;
    questionDiv.innerHTML = `
        <img src="${screenshot}" alt="Скриншот">
        <div class="answer-input">
            <input type="text" placeholder="Введите ответ">
            <button onclick="sendAnswer('${clientId}', '${questionId}', this)">Отправить</button>
        </div>
    `;
    questions.appendChild(questionDiv);
}

function sendAnswer(clientId, questionId, button) {
    const input = button.previousElementSibling;
    const answer = input.value.trim();
    if (answer && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'answer',
            clientId,
            questionId,
            answer,
            answeredBy: 'exam'
        }));
    }
}

function updateAnswer(clientId, questionId, answer) {
    const question = document.querySelector(`#questions-${clientId} .question[data-question-id="${questionId}"]`);
    if (question) {
        const input = question.querySelector('input');
        input.value = answer || '';
    }
}

function removeClient(clientId) {
    const clientSection = document.querySelector(`.client-section:has(#questions-${clientId})`);
    if (clientSection) {
        clientSection.remove();
    }
    const htmlSection = document.getElementById(`html-${clientId}`);
    if (htmlSection) {
        htmlSection.remove();
    }
    const disconnectedMessage = document.getElementById('disconnected-message');
    disconnectedMessage.style.display = 'block';
    setTimeout(() => {
        disconnectedMessage.style.display = 'none';
    }, 3000);
}

function displayPageHTML(clientId, html) {
    const htmlSections = document.getElementById('html-sections');
    let htmlSection = document.getElementById(`html-${clientId}`);

    if (!htmlSection) {
        htmlSection = document.createElement('div');
        htmlSection.id = `html-${clientId}`;
        htmlSection.className = 'html-section';
        htmlSection.innerHTML = `
            <h4>HTML клиента ${clientId}</h4>
            <div class="html-content"></div>
        `;
        htmlSections.appendChild(htmlSection);
    }

    const htmlContent = htmlSection.querySelector('.html-content');
    // Безопасное отображение HTML (избегаем XSS)
    htmlContent.textContent = html; // Отображаем как текст
}