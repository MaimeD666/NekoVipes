import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
    getDatabase,
    ref,
    set,
    onValue,
    off,
    push,
    remove,
    serverTimestamp as rtServerTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

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
    PRODUCTS: 'products'
};

const STORAGE_KEYS = {
    USER_DATA: 'nekoVipes_userData',
    CART: 'nekoVipes_cart',
    USER_ORDERS: 'nekoVipes_userOrders',
    DEVICE_ID: 'nekoVipes_deviceId'
};

let products = [];
let cart = [];
let userData = {};
let userOrders = [];
let ordersListener = null;
let currentChatOrderId = null;
let chatListener = null;
let deviceId = '';

const generateDeviceId = () => {
    return 'device_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
};

const getDeviceId = () => {
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
        id = generateDeviceId();
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
};

const saveUserData = () => {
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
};

const loadUserData = () => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    if (saved) {
        try {
            userData = JSON.parse(saved);
        } catch (error) {
            console.error('Ошибка загрузки данных пользователя:', error);
            userData = {};
        }
    }
    
    if (userData.tentLetter) {
        const tentLetterSelect = document.getElementById('tent-letter');
        if (tentLetterSelect) {
            tentLetterSelect.value = userData.tentLetter;
        }
    }
    
    if (userData.tentNumber) {
        const tentNumberInput = document.getElementById('tent-number');
        if (tentNumberInput) {
            tentNumberInput.value = userData.tentNumber;
        }
    }
    
    if (userData.phone) {
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.value = userData.phone;
        }
    }
};

const saveCart = () => {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
};

const loadCart = () => {
    const saved = localStorage.getItem(STORAGE_KEYS.CART);
    if (saved) {
        try {
            cart = JSON.parse(saved);
            updateCartDisplay();
        } catch (error) {
            console.error('Ошибка загрузки корзины:', error);
            cart = [];
        }
    }
};

const saveUserOrders = () => {
    const orderIds = userOrders.map(order => order.id);
    localStorage.setItem(STORAGE_KEYS.USER_ORDERS, JSON.stringify(orderIds));
};

const loadUserOrderIds = () => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_ORDERS);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (error) {
            console.error('Ошибка загрузки ID заказов:', error);
            return [];
        }
    }
    return [];
};

const clearUserData = () => {
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    localStorage.removeItem(STORAGE_KEYS.CART);
    localStorage.removeItem(STORAGE_KEYS.USER_ORDERS);
    userData = {};
    cart = [];
    userOrders = [];
    updateCartDisplay();
    location.reload();
};

window.clearUserData = clearUserData;

const showLoading = () => {
    document.getElementById('loading').style.display = 'flex';
};

const hideLoading = () => {
    document.getElementById('loading').style.display = 'none';
};

const showNotification = (message, type = 'error') => {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(section => section.classList.remove('active'));

    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    document.getElementById(`${tabName}-section`).classList.add('active');

    if (tabName === 'checkout') {
        showCheckout();
    } else if (tabName === 'orders') {
        loadUserOrders();
    }
};

window.switchOrdersTab = (tabType) => {
    document.querySelectorAll('.orders-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.orders-tab-section').forEach(section => section.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.orders-tab-btn'))
        .find(btn => btn.textContent.toLowerCase().includes(tabType === 'active' ? 'активные' : 'доставленные'));

    if (activeBtn) activeBtn.classList.add('active');

    const sectionId = tabType === 'active' ? 'active-orders-section' : 'delivered-orders-section';
    document.getElementById(sectionId).classList.add('active');
};

const initFirebaseData = async () => {
    try {
        const productsRef = collection(firestore, COLLECTIONS.PRODUCTS);
        const snapshot = await getDocs(productsRef);

        if (snapshot.empty) {
            const defaultProducts = [
                {
                    id: 'neko-active',
                    name: 'Neko-Active',
                    price: 500,
                    stock: 100
                },
                {
                    id: 'neko-clinic',
                    name: 'Neko-Clinic',
                    price: 1350,
                    stock: 50
                },
                {
                    id: 'neko-grill',
                    name: 'Neko-Grill',
                    price: 850,
                    stock: 75
                }
            ];

            for (const product of defaultProducts) {
                await setDoc(doc(firestore, COLLECTIONS.PRODUCTS, product.id), product);
            }
        }
    } catch (error) {
        console.error('Ошибка инициализации данных:', error);
    }
};

const loadProducts = async () => {
    try {
        showLoading();
        const snapshot = await getDocs(collection(firestore, COLLECTIONS.PRODUCTS));
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        showNotification('Ошибка загрузки товаров');
    } finally {
        hideLoading();
    }
};

const renderProducts = () => {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = products.map(product => `
        <div class="product-card fade-in">
            <div class="product-name">${product.name}</div>
            <div class="product-price">${product.price} ₽</div>
            <div class="product-stock">В наличии: ${product.stock} шт.</div>
            <div class="product-controls">
                <div class="quantity-control">
                    <button class="qty-btn" onclick="changeQuantity('${product.id}', -1)">−</button>
                    <input type="number" class="qty-input" id="qty-${product.id}" value="1" min="1" max="${product.stock}">
                    <button class="qty-btn" onclick="changeQuantity('${product.id}', 1)">+</button>
                </div>
                <button class="add-to-cart" onclick="addToCart('${product.id}')">
                    Добавить в корзину
                </button>
            </div>
        </div>
    `).join('');
};

window.changeQuantity = (productId, change) => {
    const input = document.getElementById(`qty-${productId}`);
    const product = products.find(p => p.id === productId);
    const newValue = parseInt(input.value) + change;

    if (newValue >= 1 && newValue <= product.stock) {
        input.value = newValue;
    }
};

window.addToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    const quantity = parseInt(document.getElementById(`qty-${productId}`).value);

    if (product.stock === 0) {
        showNotification('Товар закончился');
        return;
    }

    if (quantity > product.stock) {
        showNotification(`Доступно только ${product.stock} шт.`);
        document.getElementById(`qty-${productId}`).value = product.stock;
        return;
    }

    const existingItem = cart.find(item => item.id === productId);
    const currentCartQuantity = existingItem ? existingItem.quantity : 0;

    if (currentCartQuantity + quantity > product.stock) {
        const availableQuantity = product.stock - currentCartQuantity;
        if (availableQuantity === 0) {
            showNotification('Вы уже добавили максимальное количество этого товара');
            return;
        }
        showNotification(`Можно добавить ещё только ${availableQuantity} шт.`);
        return;
    }

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: productId,
            name: product.name,
            price: product.price,
            quantity: quantity
        });
    }

    updateCartDisplay();
    saveCart();
    document.getElementById(`qty-${productId}`).value = 1;

    const button = event.target;
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = '';
    }, 150);

    showNotification(`${product.name} добавлен в корзину`, 'success');
};

const updateCartDisplay = () => {
    const cartBadge = document.getElementById('cart-badge');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartBadge.textContent = totalItems;

    renderCart();
};

const renderCart = () => {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');

    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Корзина пуста</p>';
        cartTotal.style.display = 'none';
        checkoutBtn.style.display = 'none';
        return;
    }

    cartItems.innerHTML = cart.map((item, index) => `
        <div class="cart-item slide-up">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${item.price} ₽ × ${item.quantity}</div>
            </div>
            <div class="cart-item-controls">
                <div class="quantity-control">
                    <button class="qty-btn" onclick="updateCartItem(${index}, -1)">−</button>
                    <span style="padding: 0 8px; font-weight: 600; font-size: 0.9rem;">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartItem(${index}, 1)">+</button>
                </div>
                <button class="qty-btn" onclick="removeFromCart(${index})" style="background: #dc3545;">×</button>
            </div>
        </div>
    `).join('');

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('total-price').textContent = total;

    cartTotal.style.display = 'block';
    checkoutBtn.style.display = 'block';
};

window.updateCartItem = (index, change) => {
    const item = cart[index];
    const product = products.find(p => p.id === item.id);
    const newQuantity = item.quantity + change;

    if (newQuantity <= 0) {
        cart.splice(index, 1);
    } else if (newQuantity <= product.stock) {
        item.quantity = newQuantity;
    } else {
        showNotification(`Максимальное количество: ${product.stock}`);
        return;
    }

    updateCartDisplay();
    saveCart();
};

window.removeFromCart = (index) => {
    cart.splice(index, 1);
    updateCartDisplay();
    saveCart();
};

const showCheckout = () => {
    const orderItems = document.getElementById('order-items');
    const finalPrice = document.getElementById('final-price');

    orderItems.innerHTML = cart.map(item => `
        <div class="summary-item">
            <span>${item.name} × ${item.quantity}</span>
            <span>${item.price * item.quantity} ₽</span>
        </div>
    `).join('');

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    finalPrice.textContent = total;
};

const generateOrderId = () => {
    return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
};

const saveUserOrderId = (orderId) => {
    const orderIds = loadUserOrderIds();
    if (!orderIds.includes(orderId)) {
        orderIds.push(orderId);
        localStorage.setItem(STORAGE_KEYS.USER_ORDERS, JSON.stringify(orderIds));
    }
};

const getOrderStatus = (order) => {
    if (order.status === 'completed') return 'delivered';
    if (order.courierId && order.courierId !== null) return 'delivering';
    if (order.status === 'active' && order.courierId) return 'taken';
    return 'pending';
};

const getStatusText = (status) => {
    switch (status) {
        case 'pending': return 'Ожидание';
        case 'taken': return 'Взят';
        case 'delivering': return 'Везут';
        case 'delivered': return 'Доставлен';
        default: return 'Неизвестно';
    }
};

const formatOrderTime = (timestamp) => {
    if (!timestamp) return 'Не указано';
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const startOrdersListener = () => {
    if (ordersListener) {
        off(ref(rtdb, 'orders'), ordersListener);
    }

    const userOrderIds = loadUserOrderIds();
    if (userOrderIds.length === 0) {
        userOrders = [];
        updateOrdersDisplay();
        return;
    }

    const ordersRef = ref(rtdb, 'orders');
    ordersListener = onValue(ordersRef, (snapshot) => {
        userOrders = [];

        if (snapshot.exists()) {
            const allOrders = snapshot.val();

            userOrderIds.forEach(orderId => {
                const serverOrder = allOrders[orderId];
                if (serverOrder) {
                    userOrders.push({
                        id: orderId,
                        ...serverOrder
                    });
                }
            });
        }

        updateOrdersDisplay();
    });
};

const loadUserOrders = () => {
    startOrdersListener();
};

const updateOrdersDisplay = () => {
    const activeOrders = userOrders.filter(order => order.status !== 'completed');
    const deliveredOrders = userOrders.filter(order => order.status === 'completed');

    renderActiveOrders(activeOrders);
    renderDeliveredOrders(deliveredOrders);

    document.getElementById('orders-badge').textContent = activeOrders.length;
    document.getElementById('active-orders-badge').textContent = activeOrders.length;
    document.getElementById('delivered-orders-badge').textContent = deliveredOrders.length;
};

const renderActiveOrders = (orders) => {
    const container = document.getElementById('active-orders-list');

    if (orders.length === 0) {
        container.innerHTML = '<p class="empty-orders">Нет активных заказов</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const status = getOrderStatus(order);
        const canChat = order.courierId && order.status === 'active';

        return `
            <div class="order-item">
                <div class="order-header-info">
                    <div class="order-number">${order.id}</div>
                    <div class="order-status-badge ${status}">${getStatusText(status)}</div>
                </div>
                
                <div class="order-details">
                    <div class="order-detail">
                        <div class="order-detail-label">Палатка</div>
                        <div class="order-detail-value">${order.tentNumber}</div>
                    </div>
                    <div class="order-detail">
                        <div class="order-detail-label">Сумма</div>
                        <div class="order-detail-value">${order.total} ₽</div>
                    </div>
                    <div class="order-detail">
                        <div class="order-detail-label">Время заказа</div>
                        <div class="order-detail-value">${formatOrderTime(order.createdAt)}</div>
                    </div>
                    ${order.courierName ? `
                    <div class="order-detail">
                        <div class="order-detail-label">Курьер</div>
                        <div class="order-detail-value">${order.courierName}</div>
                    </div>
                    ` : ''}
                    ${order.takenAt ? `
                    <div class="order-detail">
                        <div class="order-detail-label">Взят в работу</div>
                        <div class="order-detail-value">${formatOrderTime(order.takenAt)}</div>
                    </div>
                    ` : ''}
                </div>

                <div class="order-items-preview">
                    <h4>Товары:</h4>
                    ${order.items.map(item => `
                        <div class="order-item-row">
                            <span>${item.name} × ${item.quantity}</span>
                            <span>${item.price * item.quantity} ₽</span>
                        </div>
                    `).join('')}
                </div>

                ${canChat ? `
                <div class="order-actions">
                    <button class="chat-btn" onclick="openChat('${order.id}', '${order.courierName}')">
                        💬 Чат с курьером
                    </button>
                </div>
                ` : ''}

                <div class="order-progress">
                    <div class="progress-bar">
                        <div class="progress-fill ${status}"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

const renderDeliveredOrders = (orders) => {
    const container = document.getElementById('delivered-orders-list');

    if (orders.length === 0) {
        container.innerHTML = '<p class="empty-orders">Нет доставленных заказов</p>';
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-item">
            <div class="order-header-info">
                <div class="order-number">${order.id}</div>
                <div class="order-status-badge delivered">Доставлен</div>
            </div>
            
            <div class="order-details">
                <div class="order-detail">
                    <div class="order-detail-label">Палатка</div>
                    <div class="order-detail-value">${order.tentNumber}</div>
                </div>
                <div class="order-detail">
                    <div class="order-detail-label">Сумма</div>
                    <div class="order-detail-value">${order.total} ₽</div>
                </div>
                <div class="order-detail">
                    <div class="order-detail-label">Доставлен</div>
                    <div class="order-detail-value">${formatOrderTime(order.deliveredAt)}</div>
                </div>
                ${order.courierName ? `
                <div class="order-detail">
                    <div class="order-detail-label">Курьер</div>
                    <div class="order-detail-value">${order.courierName}</div>
                </div>
                ` : ''}
            </div>

            <div class="order-items-preview">
                <h4>Товары:</h4>
                ${order.items.map(item => `
                    <div class="order-item-row">
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${item.price * item.quantity} ₽</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
};

const validateCartStock = () => {
    for (const item of cart) {
        const product = products.find(p => p.id === item.id);
        if (!product) {
            showNotification(`Товар ${item.name} больше не доступен`);
            return false;
        }
        if (item.quantity > product.stock) {
            showNotification(`Недостаточно товара ${item.name}. Доступно: ${product.stock}`);
            return false;
        }
    }
    return true;
};

const submitOrder = async (event) => {
    event.preventDefault();

    const tentLetter = document.getElementById('tent-letter').value;
    const tentNumber = document.getElementById('tent-number').value.padStart(3, '0');
    const phone = document.getElementById('phone').value.trim();

    if (!tentLetter || !tentNumber) {
        showNotification('Выберите номер палатки');
        return;
    }

    const tentNumberFull = `${tentLetter}-${tentNumber}`;

    if (!validateCartStock()) {
        return;
    }

    userData = {
        tentLetter: tentLetter,
        tentNumber: tentNumber,
        phone: phone,
        deviceId: deviceId,
        lastOrderTime: Date.now()
    };
    saveUserData();

    try {
        showLoading();

        const orderId = generateOrderId();
        const orderData = {
            id: orderId,
            items: cart,
            tentNumber: tentNumberFull,
            phone: phone || null,
            total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            status: 'active',
            isPaid: true,
            createdAt: rtServerTimestamp(),
            paidAt: rtServerTimestamp(),
            deliveredAt: null,
            courierId: null,
            courierName: null,
            takenAt: null,
            qrCode: `tent-${tentNumberFull}-${orderId}`,
            deviceId: deviceId
        };

        const orderRef = ref(rtdb, `orders/${orderId}`);
        await set(orderRef, orderData);

        saveUserOrderId(orderId);

        for (const item of cart) {
            const productRef = doc(firestore, COLLECTIONS.PRODUCTS, item.id);
            await updateDoc(productRef, {
                stock: increment(-item.quantity)
            });
        }

        document.getElementById('order-id').textContent = orderId;
        document.getElementById('delivery-tent').textContent = tentNumberFull;

        switchTab('payment');

    } catch (error) {
        console.error('Ошибка оформления заказа:', error);
        showNotification('Ошибка оформления заказа. Попробуйте еще раз.');
    } finally {
        hideLoading();
    }
};

window.newOrder = () => {
    cart = [];
    saveCart();
    updateCartDisplay();
    updateOrdersDisplay();
    document.getElementById('checkout-form').reset();
    
    loadUserData();
    
    switchTab('products');
    loadProducts();
};

window.openChat = (orderId, courierName) => {
    currentChatOrderId = orderId;
    document.getElementById('chat-title').textContent = `Чат с курьером ${courierName}`;
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
            <div class="chat-message ${message.sender === 'client' ? 'own' : 'other'}">
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
            sender: 'client',
            senderName: 'Клиент',
            timestamp: rtServerTimestamp()
        });

        input.value = '';
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения');
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

const setupTentSelector = () => {
    const tentNumberInput = document.getElementById('tent-number');
    const tentNumberList = document.getElementById('tent-number-list');

    tentNumberInput.addEventListener('input', (e) => {
        const value = e.target.value;

        if (value.length > 3) {
            e.target.value = value.slice(0, 3);
            return;
        }

        if (value.length === 0) {
            tentNumberList.style.display = 'none';
            return;
        }

        const suggestions = [];
        const numValue = parseInt(value) || 0;

        for (let i = Math.max(1, numValue); i <= Math.min(999, numValue + 10); i++) {
            if (i.toString().startsWith(value)) {
                suggestions.push(i.toString().padStart(3, '0'));
            }
        }

        if (suggestions.length > 0) {
            tentNumberList.innerHTML = suggestions.map(num =>
                `<div class="tent-suggestion" onclick="selectTentNumber('${num}')">${num}</div>`
            ).join('');
            tentNumberList.style.display = 'block';
        } else {
            tentNumberList.style.display = 'none';
        }
    });

    tentNumberInput.addEventListener('blur', () => {
        setTimeout(() => {
            tentNumberList.style.display = 'none';
        }, 200);
    });
};

window.selectTentNumber = (number) => {
    document.getElementById('tent-number').value = number;
    document.getElementById('tent-number-list').style.display = 'none';
    
    userData.tentNumber = number;
    saveUserData();
};

const setupFormAutoSave = () => {
    const tentLetterSelect = document.getElementById('tent-letter');
    const phoneInput = document.getElementById('phone');

    tentLetterSelect.addEventListener('change', (e) => {
        userData.tentLetter = e.target.value;
        saveUserData();
    });

    phoneInput.addEventListener('input', (e) => {
        userData.phone = e.target.value;
        saveUserData();
    });
};

document.addEventListener('DOMContentLoaded', function () {
    deviceId = getDeviceId();
    
    loadUserData();
    loadCart();

    document.getElementById('checkout-form').addEventListener('submit', submitOrder);
    setupTentSelector();
    setupFormAutoSave();

    document.getElementById('phone').addEventListener('input', function (e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 0) {
            if (value.length <= 1) {
                value = `+7 (${value}`;
            } else if (value.length <= 4) {
                value = `+7 (${value.substr(1)}`;
            } else if (value.length <= 7) {
                value = `+7 (${value.substr(1, 3)}) ${value.substr(4)}`;
            } else if (value.length <= 9) {
                value = `+7 (${value.substr(1, 3)}) ${value.substr(4, 3)}-${value.substr(7)}`;
            } else {
                value = `+7 (${value.substr(1, 3)}) ${value.substr(4, 3)}-${value.substr(7, 2)}-${value.substr(9, 2)}`;
            }
        }
        e.target.value = value;
        
        userData.phone = value;
        saveUserData();
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

    if (userData.lastOrderTime) {
        const lastOrderDate = new Date(userData.lastOrderTime);
        const daysSinceLastOrder = (Date.now() - userData.lastOrderTime) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastOrder < 30) {
            setTimeout(() => {
                showNotification(`Добро пожаловать обратно! ${userData.tentLetter ? `Палатка ${userData.tentLetter}-${userData.tentNumber} сохранена` : ''}`, 'success');
            }, 1000);
        }
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    await initFirebaseData();
    await loadProducts();
    loadUserOrders();
});
