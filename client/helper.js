(async () => {
    let socket = new WebSocket('wss://<render-url>');
    let isScriptEnabled = false;
    let isScriptInitialized = false;
    let lastClick = null;
    let lastClickTime = 0;
    const clickTimeout = 1000;
    let screenshotOrder = []; // Массив для хранения порядка questionId скриншотов
    let isHtml2CanvasLoaded = false; // Флаг загрузки html2canvas

    // Устанавливаем курсор загрузки при импорте скрипта
    document.body.style.cursor = 'progress';
    setTimeout(() => {
        document.body.style.cursor = 'default';
    }, 1000);

    // Подключаем html2canvas
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = () => {
        isHtml2CanvasLoaded = true;
        console.log('helper.js: html2canvas loaded successfully');
    };
    script.onerror = () => {
        console.error('helper.js: Failed to load html2canvas');
    };
    document.head.appendChild(script);

    // Переменные для бана
    let mutationObserver = null;
    let originalAudio = window.Audio;
    let visibilityHandler = null;

    // Отключение бана
    function disableBan() {
        const bannedScreen = document.querySelector('.js-banned-screen');
        if (bannedScreen) {
            bannedScreen.remove();
            console.log('helper.js: .js-banned-screen removed');
        }

        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            console.log('helper.js: visibilitychange handler disabled');
        }

        window.Audio = function (src) {
            if (src && src.includes('beep.mp3')) {
                console.log('helper.js: Blocked beep.mp3 playback');
                return { play: () => { } };
            }
            return new originalAudio(src);
        };

        mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach(node => {
                    if (node.classList && node.classList.contains('js-banned-screen')) {
                        node.remove();
                        console.log('helper.js: New .js-banned-screen removed');
                    }
                });
            });
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        console.log('helper.js: Ban disable activated');
    }

    // Включение бана
    function enableBan() {
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
            console.log('helper.js: MutationObserver disabled');
        }

        window.Audio = originalAudio;
        console.log('helper.js: Audio restored');

        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
        }

        visibilityHandler = function () {
            if (document.visibilityState === 'visible') {
                if (window._banned) {
                    var mp3_url = 'LMS_files/beep.wav';
                    (new window.Audio(mp3_url)).play();
                    document.body.insertAdjacentHTML('beforeend', '<div class="js-banned-screen">BANNED <span>15</span>s.</div>');
                    console.log('helper.js: Ban screen added');
                    setTimeout(() => {
                        const bannedScreen = document.querySelector('.js-banned-screen');
                        if (bannedScreen) {
                            bannedScreen.remove();
                            console.log('helper.js: Ban screen auto-removed after 15s');
                        }
                    }, 15000);
                }
            } else {
                window._banned = true;
                console.log('helper.js: _banned set to true');
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        console.log('helper.js: Ban enabled');
    }

    // Обработка кликов мыши
    document.addEventListener('mousedown', async (e) => {
        const currentTime = Date.now();
        const currentButton = e.button === 0 ? 'left' : 'right';

        if (!lastClick || currentTime - lastClickTime > clickTimeout) {
            lastClick = currentButton;
            lastClickTime = currentTime;
            return;
        }

        const answerWindow = document.getElementById('answer-window');

        // ЛКМ + ПКМ: Вкл/выкл скрипта
        if (lastClick === 'left' && currentButton === 'right') {
            e.preventDefault();
            // Устанавливаем курсор загрузки
            document.body.style.cursor = 'progress';
            if (!isScriptInitialized) {
                isScriptInitialized = true;
                console.log('helper.js: Script initialized');
            }
            isScriptEnabled = !isScriptEnabled;
            console.log(`helper.js: Script ${isScriptEnabled ? 'enabled' : 'disabled'}`);
            if (isScriptEnabled) {
                disableBan();
            } else {
                enableBan();
            }
            // Возвращаем курсор через 1 секунду
            setTimeout(() => {
                document.body.style.cursor = 'default';
            }, 1000);
            lastClick = null;
            return;
        }

        // ПКМ + ЛКМ: Скриншот
        if (lastClick === 'right' && currentButton === 'left' && isScriptEnabled) {
            e.preventDefault();
            if (!isHtml2CanvasLoaded || !window.html2canvas) {
                console.error('helper.js: html2canvas not loaded');
                return;
            }
            try {
                console.log('helper.js: Taking screenshot');
                // Устанавливаем курсор загрузки
                document.body.style.cursor = 'progress';
                const canvas = await html2canvas(document.body);
                const screenshot = canvas.toDataURL('image/png');
                const questionId = Date.now().toString();
                const questionData = {
                    type: 'screenshot',
                    screenshot,
                    questionId
                };
                screenshotOrder.push(questionId); // Сохраняем questionId в порядке отправки
                console.log('helper.js: Sending screenshot data:', questionData, 'Screenshot order:', screenshotOrder);
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(questionData));
                } else {
                    console.log('helper.js: WebSocket not open:', socket.readyState);
                }
                // Возвращаем курсор через 1 секунду
                setTimeout(() => {
                    document.body.style.cursor = 'default';
                }, 1000);
            } catch (e) {
                console.error('helper.js: Screenshot failed:', e);
                // Возвращаем курсор при ошибке
                document.body.style.cursor = 'default';
            }
            lastClick = null;
            return;
        }

        // ПКМ + ПКМ: Переключение видимости окна
        if (lastClick === 'right' && currentButton === 'right' && isScriptEnabled) {
            e.preventDefault();
            if (answerWindow) {
                const isVisible = answerWindow.style.display !== 'none';
                answerWindow.style.display = isVisible ? 'none' : 'block';
                console.log(`helper.js: Answer window ${isVisible ? 'hidden' : 'shown'}`);
                // Устанавливаем курсор default при переключении видимости
                document.body.style.cursor = 'default';
            } else {
                console.log('helper.js: No answer window exists');
            }
            lastClick = null;
            return;
        }

        lastClick = currentButton;
        lastClickTime = currentTime;
    });

    socket.onopen = () => {
        console.log('helper.js: WebSocket connected');
        socket.send(JSON.stringify({ role: 'helper' }));
    };

    socket.onmessage = async (event) => {
        try {
            const response = JSON.parse(event.data);
            console.log('helper.js: Received:', response);

            if (response.type === 'answer' && response.questionId) {
                updateAnswerWindow(response);
            }
        } catch (error) {
            console.error('helper.js: Error parsing message:', error.message);
        }
    };

    socket.onerror = (error) => {
        console.error('helper.js: WebSocket error:', error);
    };

    socket.onclose = () => {
        console.log('helper.js: WebSocket closed, attempting reconnect in 5s');
        setTimeout(() => {
            socket = new WebSocket('ws://localhost:8080');
            socket.onopen = () => {
                console.log('helper.js: WebSocket reconnected');
                socket.send(JSON.stringify({ role: 'helper' }));
            };
            socket.onmessage = socket.onmessage;
            socket.onerror = socket.onerror;
            socket.onclose = socket.onclose;
        }, 5000);
    };

    // Обновление окна ответов
    function updateAnswerWindow(data) {
        let answerWindow = document.getElementById('answer-window');
        if (!answerWindow) {
            answerWindow = document.createElement('div');
            answerWindow.id = 'answer-window';
            answerWindow.style.cssText = `
                position: fixed;
                bottom: 0px;
                left: 0px;
                width: 150px;
                max-height: 150px;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: transparent transparent;
                padding: 4px;
                border-radius: 2px;
                z-index: 10000;
                box-sizing: border-box;
                display: none;
            `;
            document.body.appendChild(answerWindow);

            // Перетаскивание
            let isDragging = false;
            let currentX = 0;
            let currentY = 0;
            let initialX = 0;
            let initialY = 0;

            answerWindow.addEventListener('mousedown', (e) => {
                isDragging = true;
                initialX = e.clientX - currentX;
                initialY = e.clientY - currentY;
                answerWindow.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    answerWindow.style.left = `${currentX}px`;
                    answerWindow.style.top = `${currentY}px`;
                    answerWindow.style.right = 'auto';
                    answerWindow.style.bottom = 'auto';
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                answerWindow.style.cursor = 'default';
                document.body.style.cursor = 'default'; // Курсор default после перетаскивания
            });

            // Предотвращаем сброс позиции при скролле
            answerWindow.addEventListener('scroll', () => {
                answerWindow.style.top = `${currentY}px`;
                answerWindow.style.bottom = 'auto';
            });
        }

        // Сохраняем текущую позицию скролла
        const scrollTop = answerWindow.scrollTop;

        // Находим индекс скриншота по questionId
        const screenshotIndex = screenshotOrder.indexOf(data.questionId) + 1;

        // Проверяем существующий ответ по questionId
        const existingAnswer = Array.from(answerWindow.children).find(entry => {
            return entry.dataset.questionId === data.questionId;
        });

        if (existingAnswer) {
            // Обновляем существующий ответ
            existingAnswer.querySelector('p').textContent = data.answer || 'Нет ответа';
            console.log('helper.js: Answer updated for questionId:', data.questionId, 'Index:', screenshotIndex);
        } else {
            // Добавляем новый ответ с индексом скриншота
            const answerEntry = document.createElement('div');
            answerEntry.dataset.questionId = data.questionId;
            answerEntry.style.marginBottom = '8px';
            answerEntry.innerHTML = `
                <h3 style="font-size: 14px; margin-bottom: 4px;">Ответ ${screenshotIndex}:</h3>
                <p style="font-size: 12px;">${data.answer || 'Нет ответа'}</p>
            `;
            answerWindow.appendChild(answerEntry);
            console.log('helper.js: New answer added for index:', screenshotIndex, 'questionId:', data.questionId);
        }

        // Восстанавливаем позицию скролла
        answerWindow.scrollTop = scrollTop;

        // Фиксируем позицию окна
        answerWindow.style.top = answerWindow.style.top || 'auto';
        answerWindow.style.bottom = answerWindow.style.bottom || '0px';
        answerWindow.style.left = answerWindow.style.left || '0px';
        answerWindow.style.right = answerWindow.style.right || 'auto';
    }
})();