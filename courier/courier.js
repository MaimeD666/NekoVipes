import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
    getDatabase,
    ref,
    get,
    update,
    onValue,
    off,
    push,
    remove,
    serverTimestamp as rtServerTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import QrScanner from 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner.min.js';

const firebaseConfig = {
    apiKey: "AIzaSyA27CsXOK8SLbitv34V9egp0-9oBs5HOOE",
    authDomain: "neko-vipes.firebaseapp.com",
    projectId: "neko-vipes",
    storageBucket: "neko-vipes.firebasestorage.app",
    messagingSenderId: "768053381748",
    appId: "1:768053381748:web:959b04e2126f441ef79f21",
    databaseURL: "https://neko-vipes-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const rtdb = getDatabase(app);

const COLLECTIONS = {
    COURIERS: 'couriers'
};

let currentCourier = null;
let ordersListener = null;
let courierStatusListener = null;
let activeTab = 'available';
let currentChatOrderId = null;
let chatListener = null;
let qrScanner = null;
let currentScanOrderId = null;

const showLoading = () => {
    document.getElementById('loading').style.display = 'flex';
};

const hideLoading = () => {
    document.getElementById('loading').style.display = 'none';
};

const showError = (message) => {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 5000);
};

const formatTime = (timestamp) => {
    if (!timestamp) return 'Не указано';
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
};

const startCourierStatusListener = () => {
    if (!currentCourier || !currentCourier.id) return;

    if (courierStatusListener) {
        courierStatusListener();
    }

    const courierDocRef = doc(firestore, COLLECTIONS.COURIERS, currentCourier.id);
    courierStatusListener = onSnapshot(courierDocRef, (doc) => {
        if (!doc.exists()) {
            alert('Ваша учетная запись была удалена администратором');
            logout();
            return;
        }

        const courierData = doc.data();
        if (!courierData.isActive) {
            alert('Ваша учетная запись была заблокирована администратором');
            logout();
            return;
        }

        currentCourier = { id: doc.id, ...courierData };
        sessionStorage.setItem('courier', JSON.stringify(currentCourier));
    }, (error) => {
        console.error('Ошибка слушателя статуса курьера:', error);
    });
};

const login = async (event) => {
    event.preventDefault();

    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!login || !password) {
        showError('Заполните все поля');
        return;
    }

    try {
        showLoading();

        const couriersQuery = query(
            collection(firestore, COLLECTIONS.COURIERS),
            where('login', '==', login)
        );

        const snapshot = await getDocs(couriersQuery);

        if (snapshot.empty) {
            showError('Неверный логин или пароль');
            return;
        }

        const courierDoc = snapshot.docs[0];
        const courierData = courierDoc.data();

        if (courierData.password !== password) {
            showError('Неверный логин или пароль');
            return;
        }

        if (!courierData.isActive) {
            showError('Аккаунт заблокирован');
            return;
        }

        currentCourier = {
            id: courierDoc.id,
            ...courierData
        };

        sessionStorage.setItem('courier', JSON.stringify(currentCourier));
        showCourierPanel();

    } catch (error) {
        console.error('Ошибка авторизации:', error);
        showError('Ошибка подключения');
    } finally {
        hideLoading();
    }
};

const logout = () => {
    if (ordersListener) {
        ordersListener();
    }

    if (courierStatusListener) {
        courierStatusListener();
    }

    if (chatListener) {
        chatListener();
    }

    if (qrScanner) {
        qrScanner.stop();
        qrScanner = null;
    }

    sessionStorage.removeItem('courier');
    currentCourier = null;

    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('courier-panel').style.display = 'none';

    document.getElementById('login-form').reset();
};

const checkAuth = () => {
    const savedCourier = sessionStorage.getItem('courier');
    if (savedCourier) {
        currentCourier = JSON.parse(savedCourier);
        showCourierPanel();
        return true;
    }
    return false;
};

const showCourierPanel = () => {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('courier-panel').style.display = 'flex';
    document.getElementById('courier-name').textContent = currentCourier.name;

    loadOrders();
    startOrdersListener();
    startCourierStatusListener();
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(section => section.classList.remove('active'));

    const tabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn =>
        btn.textContent.toLowerCase().includes(tabName === 'available' ? 'доступные' : 'мои')
    );

    if (tabBtn) tabBtn.classList.add('active');

    const sectionId = tabName === 'available' ? 'available-section' : 'my-orders-section';
    document.getElementById(sectionId).classList.add('active');

    activeTab = tabName;
};

window.switchMyOrdersTab = (tabType) => {
    document.querySelectorAll('.my-orders-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.my-orders-tab-section').forEach(section => section.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.my-orders-tab-btn'))
        .find(btn => btn.textContent.toLowerCase().includes(tabType === 'active' ? 'активные' : 'выполненные'));

    if (activeBtn) activeBtn.classList.add('active');

    const sectionId = tabType === 'active' ? 'my-active-section' : 'my-completed-section';
    document.getElementById(sectionId).classList.add('active');
};

const loadOrders = async () => {
    try {
        showLoading();

        const ordersRef = ref(rtdb, 'orders');
        const snapshot = await get(ordersRef);

        if (snapshot.exists()) {
            const ordersData = snapshot.val();
            const allOrders = Object.entries(ordersData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            renderOrders(allOrders);
        } else {
            renderOrders([]);
        }

    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
    } finally {
        hideLoading();
    }
};

const startOrdersListener = () => {
    if (ordersListener) {
        ordersListener();
    }

    const ordersRef = ref(rtdb, 'orders');
    ordersListener = onValue(ordersRef, (snapshot) => {
        if (snapshot.exists()) {
            const ordersData = snapshot.val();
            const allOrders = Object.entries(ordersData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            renderOrders(allOrders);
        } else {
            renderOrders([]);
        }
    });
};

const renderOrders = (allOrders) => {
    const availableOrders = allOrders.filter(order => order.status === 'active' && !order.courierId);
    const myActiveOrders = allOrders.filter(order => order.status === 'active' && order.courierId === currentCourier.id);
    const myCompletedOrders = allOrders.filter(order => order.status === 'completed' && order.courierId === currentCourier.id);

    renderAvailableOrders(availableOrders);
    renderMyActiveOrders(myActiveOrders);
    renderMyCompletedOrders(myCompletedOrders);

    document.getElementById('available-badge').textContent = availableOrders.length;
    document.getElementById('my-orders-badge').textContent = myActiveOrders.length + myCompletedOrders.length;
    document.getElementById('my-active-badge').textContent = myActiveOrders.length;
    document.getElementById('my-completed-badge').textContent = myCompletedOrders.length;
};

const renderAvailableOrders = (orders) => {
    const container = document.getElementById('available-orders');

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет доступных заказов</div>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card-compact">
            <div class="compact-header">
                <div class="order-id-compact">${order.id}</div>
                <div class="order-tent-compact">Палатка: ${order.tentNumber}</div>
            </div>
            
            <div class="compact-items">
                ${order.items.slice(0, 2).map(item => `
                    <div class="compact-item">${item.name} × ${item.quantity}</div>
                `).join('')}
                ${order.items.length > 2 ? `<div class="more-items">+${order.items.length - 2} ещё</div>` : ''}
            </div>
            
            <div class="compact-footer">
                <div class="order-price-compact">${formatPrice(order.total)} ₽</div>
                <div class="compact-actions">
                    <button class="details-btn" onclick="showOrderDetails('${order.id}', 'available')">
                        Подробнее
                    </button>
                    <button class="take-btn" onclick="takeOrder('${order.id}')">
                        Взять
                    </button>
                </div>
            </div>
        </div>
    `).join('');
};

const renderMyActiveOrders = (orders) => {
    const container = document.getElementById('my-active-orders');

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">У вас нет активных заказов</div>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card" onclick="showOrderDetails('${order.id}', 'my')">
            <div class="order-header">
                <div class="order-id">${order.id}</div>
                <div class="order-status in-delivery">В доставке</div>
            </div>
            
            <div class="order-info">
                <div class="info-item">
                    <div class="info-label">Палатка</div>
                    <div class="info-value">${order.tentNumber}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Сумма</div>
                    <div class="info-value">${formatPrice(order.total)} ₽</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Взят в работу</div>
                    <div class="info-value">${formatTime(order.takenAt)}</div>
                </div>
                ${order.phone ? `
                <div class="info-item">
                    <div class="info-label">Телефон</div>
                    <div class="info-value">${order.phone}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="order-items">
                <h4>Товары:</h4>
                ${order.items.map(item => `
                    <div class="item-row">
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${formatPrice(item.price * item.quantity)} ₽</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="order-actions">
                <button class="action-btn" onclick="event.stopPropagation(); openCourierChat('${order.id}')">
                    💬 Чат с клиентом
                </button>
                <button class="action-btn success" onclick="event.stopPropagation(); openQRScanner('${order.id}')">
                    📱 Сканировать QR
                </button>
                <button class="action-btn secondary" onclick="event.stopPropagation(); releaseOrder('${order.id}')">
                    Отказаться
                </button>
            </div>
        </div>
    `).join('');
};

const renderMyCompletedOrders = (orders) => {
    const container = document.getElementById('my-completed-orders');

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">У вас нет выполненных заказов</div>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card" onclick="showOrderDetails('${order.id}', 'completed')">
            <div class="order-header">
                <div class="order-id">${order.id}</div>
                <div class="order-status completed">Доставлен</div>
            </div>
            
            <div class="order-info">
                <div class="info-item">
                    <div class="info-label">Палатка</div>
                    <div class="info-value">${order.tentNumber}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Сумма</div>
                    <div class="info-value">${formatPrice(order.total)} ₽</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Доставлен</div>
                    <div class="info-value">${formatTime(order.deliveredAt)}</div>
                </div>
                ${order.phone ? `
                <div class="info-item">
                    <div class="info-label">Телефон</div>
                    <div class="info-value">${order.phone}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="order-items">
                <h4>Товары:</h4>
                ${order.items.map(item => `
                    <div class="item-row">
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${formatPrice(item.price * item.quantity)} ₽</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
};

const takeOrder = async (orderId) => {
    if (!confirm('Взять этот заказ?')) return;

    try {
        showLoading();

        const orderRef = ref(rtdb, `orders/${orderId}`);
        await update(orderRef, {
            courierId: currentCourier.id,
            courierName: currentCourier.name,
            takenAt: rtServerTimestamp()
        });

    } catch (error) {
        console.error('Ошибка при взятии заказа:', error);
        alert('Ошибка при взятии заказа');
    } finally {
        hideLoading();
    }
};

const completeOrder = async (orderId) => {
    try {
        showLoading();

        const orderRef = ref(rtdb, `orders/${orderId}`);
        await update(orderRef, {
            status: 'completed',
            deliveredAt: rtServerTimestamp()
        });

        await deleteOrderChat(orderId);

    } catch (error) {
        console.error('Ошибка при завершении заказа:', error);
        alert('Ошибка при завершении заказа');
    } finally {
        hideLoading();
    }
};

const releaseOrder = async (orderId) => {
    if (!confirm('Отказаться от заказа? Он станет снова доступен другим курьерам.')) return;

    try {
        showLoading();

        const orderRef = ref(rtdb, `orders/${orderId}`);
        await update(orderRef, {
            courierId: null,
            courierName: null,
            takenAt: null
        });

        await deleteOrderChat(orderId);

    } catch (error) {
        console.error('Ошибка при отказе от заказа:', error);
        alert('Ошибка при отказе от заказа');
    } finally {
        hideLoading();
    }
};

window.openQRScanner = async (orderId) => {
    currentScanOrderId = orderId;
    document.getElementById('qr-scanner-modal').style.display = 'flex';
    document.getElementById('qr-scanner-status').textContent = 'Готов к сканированию';

    try {
        await startQRScanner();
    } catch (error) {
        console.error('Ошибка запуска сканера:', error);
        alert('Ошибка доступа к камере');
        closeQRScanner();
    }
};

window.closeQRScanner = () => {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner = null;
    }
    currentScanOrderId = null;
    document.getElementById('qr-scanner-modal').style.display = 'none';
};

const startQRScanner = async () => {
    const videoElement = document.getElementById('qr-video');

    qrScanner = new QrScanner(videoElement, result => {
        handleQRScan(result);
    }, {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5
    });

    await qrScanner.start();
};

const handleQRScan = async (result) => {
    if (!currentScanOrderId) return;

    try {
        showLoading();

        const orderRef = ref(rtdb, `orders/${currentScanOrderId}`);
        const snapshot = await get(orderRef);

        if (!snapshot.exists()) {
            alert('Заказ не найден');
            return;
        }

        const order = snapshot.val();
        const expectedQR = `tent-${order.tentNumber}`;

        if (result.data === expectedQR) {
            document.getElementById('qr-scanner-status').textContent = 'QR код подтвержден!';

            await completeOrder(currentScanOrderId);
            closeQRScanner();

            alert('Заказ успешно доставлен!');
        } else {
            document.getElementById('qr-scanner-status').textContent = 'Неверный QR код!';
            setTimeout(() => {
                document.getElementById('qr-scanner-status').textContent = 'Готов к сканированию';
            }, 2000);
        }
    } catch (error) {
        console.error('Ошибка обработки QR кода:', error);
        alert('Ошибка обработки QR кода');
    } finally {
        hideLoading();
    }
};

window.openCourierChat = (orderId) => {
    currentChatOrderId = orderId;
    document.getElementById('chat-title').textContent = 'Чат с клиентом';
    document.getElementById('chat-modal').style.display = 'flex';

    startChatListener();
    loadChatMessages();
};

window.closeChat = () => {
    if (chatListener) {
        chatListener();
        chatListener = null;
    }
    currentChatOrderId = null;
    document.getElementById('chat-modal').style.display = 'none';
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
};

const startChatListener = () => {
    if (!currentChatOrderId) return;

    if (chatListener) {
        chatListener();
    }

    const messagesRef = ref(rtdb, `chats/${currentChatOrderId}/messages`);
    chatListener = onValue(messagesRef, (snapshot) => {
        const messagesContainer = document.getElementById('chat-messages');

        if (!snapshot.exists()) {
            messagesContainer.innerHTML = '<div class="chat-empty">Начните диалог</div>';
            return;
        }

        const messages = [];
        snapshot.forEach((childSnapshot) => {
            messages.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        messagesContainer.innerHTML = messages.map(message => `
            <div class="chat-message ${message.sender === 'courier' ? 'own' : 'other'}">
                <div class="message-text">${message.text}</div>
                <div class="message-time">${formatMessageTime(message.timestamp)}</div>
            </div>
        `).join('');

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
};

const loadChatMessages = () => {
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="chat-loading">Загрузка сообщений...</div>';
};

const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

window.sendMessage = async () => {
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();

    if (!messageText || !currentChatOrderId) return;

    try {
        const messagesRef = ref(rtdb, `chats/${currentChatOrderId}/messages`);
        await push(messagesRef, {
            text: messageText,
            sender: 'courier',
            senderName: currentCourier.name,
            timestamp: rtServerTimestamp()
        });

        input.value = '';
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        alert('Ошибка отправки сообщения');
    }
};

const deleteOrderChat = async (orderId) => {
    try {
        const chatRef = ref(rtdb, `chats/${orderId}`);
        await remove(chatRef);
    } catch (error) {
        console.error('Ошибка удаления чата:', error);
    }
};

window.showOrderDetails = async (orderId, type) => {
    try {
        const orderRef = ref(rtdb, `orders/${orderId}`);
        const snapshot = await get(orderRef);

        if (!snapshot.exists()) {
            alert('Заказ не найден');
            return;
        }

        const order = { id: orderId, ...snapshot.val() };

        const modalContent = document.getElementById('modal-content');
        const modalActions = document.getElementById('modal-actions');

        modalContent.innerHTML = `
            <div class="modal-order-header">
                <div class="modal-order-id">Заказ ${order.id}</div>
                <div class="order-status ${order.status}">${order.status === 'active' ? 'Активен' : 'Завершён'}</div>
            </div>
            
            <div class="modal-order-info">
                <div class="info-item">
                    <div class="info-label">Палатка</div>
                    <div class="info-value">${order.tentNumber}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Сумма</div>
                    <div class="info-value">${formatPrice(order.total)} ₽</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Время заказа</div>
                    <div class="info-value">${formatTime(order.createdAt)}</div>
                </div>
                ${order.phone ? `
                <div class="info-item">
                    <div class="info-label">Телефон</div>
                    <div class="info-value">${order.phone}</div>
                </div>
                ` : ''}
                ${order.courierName ? `
                <div class="info-item">
                    <div class="info-label">Курьер</div>
                    <div class="info-value">${order.courierName}</div>
                </div>
                ` : ''}
                ${order.takenAt ? `
                <div class="info-item">
                    <div class="info-label">Взят в работу</div>
                    <div class="info-value">${formatTime(order.takenAt)}</div>
                </div>
                ` : ''}
                ${order.deliveredAt ? `
                <div class="info-item">
                    <div class="info-label">Доставлен</div>
                    <div class="info-value">${formatTime(order.deliveredAt)}</div>
                </div>
                ` : ''}
            </div>
            
            <div class="modal-order-items">
                <h4>Товары:</h4>
                ${order.items.map(item => `
                    <div class="item-row">
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${formatPrice(item.price * item.quantity)} ₽</span>
                    </div>
                `).join('')}
            </div>
        `;

        if (type === 'available') {
            modalActions.innerHTML = `
                <button class="action-btn" onclick="closeModal(); takeOrder('${order.id}')">
                    Взять заказ
                </button>
            `;
        } else if (type === 'my') {
            modalActions.innerHTML = `
                <button class="action-btn" onclick="closeModal(); openCourierChat('${order.id}')">
                    💬 Чат с клиентом
                </button>
                <button class="action-btn success" onclick="closeModal(); openQRScanner('${order.id}')">
                    📱 Сканировать QR
                </button>
                <button class="action-btn secondary" onclick="closeModal(); releaseOrder('${order.id}')">
                    Отказаться
                </button>
            `;
        } else {
            modalActions.innerHTML = '';
        }

        document.getElementById('modal-overlay').style.display = 'flex';

    } catch (error) {
        console.error('Ошибка загрузки деталей заказа:', error);
        alert('Ошибка загрузки деталей заказа');
    }
};

window.closeModal = () => {
    document.getElementById('modal-overlay').style.display = 'none';
};

window.takeOrder = takeOrder;
window.completeOrder = completeOrder;
window.releaseOrder = releaseOrder;
window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', login);

    if (!checkAuth()) {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('courier-panel').style.display = 'none';
    }

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    });

    document.getElementById('qr-scanner-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeQRScanner();
        }
    });

    document.getElementById('chat-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.getElementById('chat-modal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeChat();
        }
    });
});

window.loadOrders = loadOrders;
