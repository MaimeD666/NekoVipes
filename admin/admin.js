import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    setDoc,
    deleteDoc,
    updateDoc,
    query,
    orderBy
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
    getDatabase,
    ref,
    onValue,
    off
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
const auth = getAuth(app);
const firestore = getFirestore(app);
const rtdb = getDatabase(app);

const COLLECTIONS = {
    COURIERS: 'couriers',
    PRODUCTS: 'products'
};

let currentUser = null;
let allOrders = [];
let allCouriers = [];
let allProducts = [];
let ordersListener = null;
let activeTab = 'dashboard';
let activeOrdersTab = 'all';
let activeCouriersTab = 'all';

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

const generateCourierId = () => {
    return 'courier_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

const login = async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
        showError('Заполните все поля');
        return;
    }

    try {
        showLoading();

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('email-verification').style.display = 'flex';
            return;
        }

        currentUser = user;
        showAdminPanel();

    } catch (error) {
        console.error('Ошибка авторизации:', error);

        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            showError('Неверный email или пароль');
        } else if (error.code === 'auth/too-many-requests') {
            showError('Слишком много попыток входа. Попробуйте позже');
        } else {
            showError('Ошибка авторизации');
        }
    } finally {
        hideLoading();
    }
};

const logout = async () => {
    try {
        await signOut(auth);
        if (ordersListener) {
            ordersListener();
        }
        currentUser = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('email-verification').style.display = 'none';
        document.getElementById('login-form').reset();
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
};

window.resendVerification = async () => {
    try {
        if (auth.currentUser) {
            await sendEmailVerification(auth.currentUser);
            alert('Письмо с подтверждением отправлено повторно');
        }
    } catch (error) {
        console.error('Ошибка отправки подтверждения:', error);
        alert('Ошибка отправки письма');
    }
};

window.backToLogin = () => {
    document.getElementById('email-verification').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
};

const showAdminPanel = () => {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('email-verification').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'flex';
    document.getElementById('admin-email').textContent = currentUser.email;

    loadAllData();
    startOrdersListener();
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(section => section.classList.remove('active'));

    const tabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => {
        const text = btn.textContent.toLowerCase();
        if (tabName === 'dashboard') return text.includes('главная');
        if (tabName === 'orders') return text.includes('заказы');
        if (tabName === 'couriers') return text.includes('курьеры') && !text.includes('новый');
        if (tabName === 'products') return text.includes('товары');
        if (tabName === 'create-courier') return text.includes('новый');
        return false;
    });

    if (tabBtn) tabBtn.classList.add('active');
    document.getElementById(`${tabName}-section`).classList.add('active');

    activeTab = tabName;

    if (tabName === 'orders') {
        renderOrdersTab();
    } else if (tabName === 'couriers') {
        renderCouriersTab();
    } else if (tabName === 'products') {
        renderProductsTab();
    }
};

window.switchOrdersTab = (tabType) => {
    document.querySelectorAll('.orders-tab-btn').forEach(btn => btn.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.orders-tab-btn'))
        .find(btn => {
            const text = btn.textContent.toLowerCase();
            if (tabType === 'all') return text.includes('все');
            if (tabType === 'active') return text.includes('активные');
            if (tabType === 'completed') return text.includes('завершенные');
            return false;
        });

    if (activeBtn) activeBtn.classList.add('active');

    activeOrdersTab = tabType;
    renderOrdersTab();
};

window.switchCouriersTab = (tabType) => {
    document.querySelectorAll('.couriers-tab-btn').forEach(btn => btn.classList.remove('active'));

    const activeBtn = Array.from(document.querySelectorAll('.couriers-tab-btn'))
        .find(btn => {
            const text = btn.textContent.toLowerCase();
            if (tabType === 'all') return text.includes('все');
            if (tabType === 'active') return text.includes('активные');
            if (tabType === 'blocked') return text.includes('заблокированные');
            return false;
        });

    if (activeBtn) activeBtn.classList.add('active');

    activeCouriersTab = tabType;
    renderCouriersTab();
};

const loadAllData = async () => {
    await Promise.all([
        loadCouriers(),
        loadOrders(),
        loadProducts()
    ]);
    updateStats();
    renderDashboard();
};

const loadCouriers = async () => {
    try {
        const snapshot = await getDocs(collection(firestore, COLLECTIONS.COURIERS));
        allCouriers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateCouriersBadges();
    } catch (error) {
        console.error('Ошибка загрузки курьеров:', error);
    }
};

const loadOrders = async () => {
    try {
        const ordersRef = ref(rtdb, 'orders');
        const snapshot = await new Promise((resolve) => {
            onValue(ordersRef, resolve, { onlyOnce: true });
        });

        if (snapshot.exists()) {
            const ordersData = snapshot.val();
            allOrders = Object.entries(ordersData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
            allOrders = [];
        }
        updateOrdersBadges();
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        allOrders = [];
    }
};

const loadProducts = async () => {
    try {
        const snapshot = await getDocs(collection(firestore, COLLECTIONS.PRODUCTS));
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateProductsBadges();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
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
            allOrders = Object.entries(ordersData)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
            allOrders = [];
        }

        updateOrdersBadges();
        updateStats();

        if (activeTab === 'dashboard') {
            renderDashboard();
        } else if (activeTab === 'orders') {
            renderOrdersTab();
        } else if (activeTab === 'couriers') {
            renderCouriersTab();
        }
    });
};

const updateStats = () => {
    const totalOrders = allOrders.length;
    const activeOrders = allOrders.filter(order => order.status === 'active').length;
    const totalCouriers = allCouriers.length;
    const activeCouriers = allCouriers.filter(courier => courier.isActive).length;

    document.getElementById('total-orders').textContent = totalOrders;
    document.getElementById('active-orders').textContent = activeOrders;
    document.getElementById('total-couriers').textContent = totalCouriers;
    document.getElementById('active-couriers').textContent = activeCouriers;
};

const updateOrdersBadges = () => {
    const allOrdersCount = allOrders.length;
    const activeOrdersCount = allOrders.filter(order => order.status === 'active').length;
    const completedOrdersCount = allOrders.filter(order => order.status === 'completed').length;

    document.getElementById('orders-badge').textContent = allOrdersCount;
    document.getElementById('all-orders-badge').textContent = allOrdersCount;
    document.getElementById('orders-active-badge').textContent = activeOrdersCount;
    document.getElementById('orders-completed-badge').textContent = completedOrdersCount;
};

const updateCouriersBadges = () => {
    const allCouriersCount = allCouriers.length;
    const activeCouriersCount = allCouriers.filter(courier => courier.isActive).length;
    const blockedCouriersCount = allCouriers.filter(courier => !courier.isActive).length;

    document.getElementById('couriers-badge').textContent = allCouriersCount;
    document.getElementById('all-couriers-badge').textContent = allCouriersCount;
    document.getElementById('couriers-active-badge').textContent = activeCouriersCount;
    document.getElementById('couriers-blocked-badge').textContent = blockedCouriersCount;
};

const updateProductsBadges = () => {
    const productsCount = allProducts.length;
    document.getElementById('products-badge').textContent = productsCount;
};

const renderDashboard = () => {
    const recentOrders = allOrders.slice(0, 5);
    const container = document.getElementById('recent-orders');

    if (recentOrders.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет заказов</div>';
        return;
    }

    container.innerHTML = recentOrders.map(order => `
        <div class="order-card" onclick="showOrderDetails('${order.id}')">
            <div class="order-header">
                <div class="order-id">${order.id}</div>
                <div class="order-status ${order.status}">${order.status === 'active' ? 'Активен' : 'Завершён'}</div>
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
                    <div class="info-label">Время</div>
                    <div class="info-value">${formatTime(order.createdAt)}</div>
                </div>
                ${order.courierName ? `
                <div class="info-item">
                    <div class="info-label">Курьер</div>
                    <div class="info-value">${order.courierName}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
};

const renderOrdersTab = () => {
    let filteredOrders = allOrders;

    if (activeOrdersTab === 'active') {
        filteredOrders = allOrders.filter(order => order.status === 'active');
    } else if (activeOrdersTab === 'completed') {
        filteredOrders = allOrders.filter(order => order.status === 'completed');
    }

    const container = document.getElementById('orders-list');

    if (filteredOrders.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет заказов</div>';
        return;
    }

    container.innerHTML = filteredOrders.map(order => `
        <div class="order-card" onclick="showOrderDetails('${order.id}')">
            <div class="order-header">
                <div class="order-id">${order.id}</div>
                <div class="order-status ${order.status}">${order.status === 'active' ? 'Активен' : 'Завершён'}</div>
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
        </div>
    `).join('');
};

const renderCouriersTab = () => {
    let filteredCouriers = allCouriers;

    if (activeCouriersTab === 'active') {
        filteredCouriers = allCouriers.filter(courier => courier.isActive);
    } else if (activeCouriersTab === 'blocked') {
        filteredCouriers = allCouriers.filter(courier => !courier.isActive);
    }

    const container = document.getElementById('couriers-list');

    if (filteredCouriers.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет курьеров</div>';
        return;
    }

    container.innerHTML = filteredCouriers.map(courier => {
        const courierOrders = allOrders.filter(order => order.courierId === courier.id);
        const activeOrdersCount = courierOrders.filter(order => order.status === 'active').length;
        const completedOrders = courierOrders.filter(order => order.status === 'completed');
        const completedOrdersCount = completedOrders.length;
        const totalEarnings = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);

        return `
            <div class="courier-card" onclick="showCourierDetails('${courier.id}')">
                <div class="courier-header">
                    <div class="courier-id">${courier.name}</div>
                    <div class="courier-status ${courier.isActive ? 'active' : 'blocked'}">
                        ${courier.isActive ? 'Активен' : 'Заблокирован'}
                    </div>
                </div>
                <div class="courier-info">
                    <div class="info-item">
                        <div class="info-label">Логин</div>
                        <div class="info-value">${courier.login}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Активные заказы</div>
                        <div class="info-value">${activeOrdersCount}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Выполнено</div>
                        <div class="info-value">${completedOrdersCount}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Общая сумма</div>
                        <div class="info-value">${formatPrice(totalEarnings)} ₽</div>
                    </div>
                </div>
                <div class="courier-actions">
                    <button class="action-btn ${courier.isActive ? 'danger' : 'success'}" 
                            onclick="event.stopPropagation(); toggleCourierStatus('${courier.id}', ${!courier.isActive})">
                        ${courier.isActive ? 'Заблокировать' : 'Активировать'}
                    </button>
                    <button class="action-btn danger" 
                            onclick="event.stopPropagation(); deleteCourier('${courier.id}')">
                        Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

const createCourier = async (event) => {
    event.preventDefault();

    const name = document.getElementById('courier-name').value.trim();
    const login = document.getElementById('courier-login').value.trim();
    const password = document.getElementById('courier-password').value.trim();
    const isActive = document.getElementById('courier-active').checked;

    if (!name || !login || !password) {
        alert('Заполните все поля');
        return;
    }

    const existingCourier = allCouriers.find(courier => courier.login === login);
    if (existingCourier) {
        alert('Курьер с таким логином уже существует');
        return;
    }

    try {
        showLoading();

        const courierId = generateCourierId();
        const courierData = {
            name: name,
            login: login,
            password: password,
            isActive: isActive
        };

        await setDoc(doc(firestore, COLLECTIONS.COURIERS, courierId), courierData);

        allCouriers.push({ id: courierId, ...courierData });
        updateCouriersBadges();
        updateStats();

        document.getElementById('courier-form').reset();
        document.getElementById('courier-active').checked = true;

        alert('Курьер успешно создан');

        if (activeTab === 'couriers') {
            renderCouriersTab();
        }

    } catch (error) {
        console.error('Ошибка создания курьера:', error);
        alert('Ошибка создания курьера');
    } finally {
        hideLoading();
    }
};

const toggleCourierStatus = async (courierId, newStatus) => {
    if (!confirm(`${newStatus ? 'Активировать' : 'Заблокировать'} курьера?`)) return;

    try {
        showLoading();

        await updateDoc(doc(firestore, COLLECTIONS.COURIERS, courierId), {
            isActive: newStatus
        });

        const courierIndex = allCouriers.findIndex(courier => courier.id === courierId);
        if (courierIndex !== -1) {
            allCouriers[courierIndex].isActive = newStatus;
        }

        updateCouriersBadges();
        updateStats();
        renderCouriersTab();

    } catch (error) {
        console.error('Ошибка изменения статуса курьера:', error);
        alert('Ошибка изменения статуса курьера');
    } finally {
        hideLoading();
    }
};

const deleteCourier = async (courierId) => {
    const courier = allCouriers.find(c => c.id === courierId);
    if (!courier) return;

    const activeCourierOrders = allOrders.filter(order =>
        order.courierId === courierId && order.status === 'active'
    );

    if (activeCourierOrders.length > 0) {
        alert('Нельзя удалить курьера с активными заказами');
        return;
    }

    if (!confirm(`Удалить курьера "${courier.name}"?`)) return;

    try {
        showLoading();

        await deleteDoc(doc(firestore, COLLECTIONS.COURIERS, courierId));

        allCouriers = allCouriers.filter(courier => courier.id !== courierId);
        updateCouriersBadges();
        updateStats();
        renderCouriersTab();

    } catch (error) {
        console.error('Ошибка удаления курьера:', error);
        alert('Ошибка удаления курьера');
    } finally {
        hideLoading();
    }
};

const renderProductsTab = () => {
    const container = document.getElementById('products-list');

    if (allProducts.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет товаров</div>';
        return;
    }

    container.innerHTML = allProducts.map(product => {
        const getStockStatus = (stock) => {
            if (stock === 0) return 'out-of-stock';
            if (stock < 10) return 'low-stock';
            return 'in-stock';
        };

        const getStockText = (stock) => {
            if (stock === 0) return 'Нет в наличии';
            if (stock < 10) return 'Мало';
            return 'В наличии';
        };

        return `
            <div class="product-card" onclick="showProductDetails('${product.id}')">
                <div class="product-header">
                    <div class="product-id">${product.name}</div>
                    <div class="product-stock-status ${getStockStatus(product.stock)}">
                        ${getStockText(product.stock)}
                    </div>
                </div>
                <div class="product-info">
                    <div class="info-item">
                        <div class="info-label">Цена</div>
                        <div class="info-value">${formatPrice(product.price)} ₽</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Остаток</div>
                        <div class="info-value">${product.stock} шт.</div>
                    </div>
                </div>
                <div class="product-actions">
                    <button class="action-btn" 
                            onclick="event.stopPropagation(); showEditProductModal('${product.id}')">
                        Редактировать
                    </button>
                    <button class="action-btn danger" 
                            onclick="event.stopPropagation(); deleteProduct('${product.id}')">
                        Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

const generateProductId = () => {
    return 'product_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

const createProduct = async (productData) => {
    try {
        showLoading();

        const productId = generateProductId();
        await setDoc(doc(firestore, COLLECTIONS.PRODUCTS, productId), productData);

        allProducts.push({ id: productId, ...productData });
        updateProductsBadges();
        renderProductsTab();

        return true;
    } catch (error) {
        console.error('Ошибка создания товара:', error);
        alert('Ошибка создания товара');
        return false;
    } finally {
        hideLoading();
    }
};

const updateProduct = async (productId, productData) => {
    try {
        showLoading();

        await updateDoc(doc(firestore, COLLECTIONS.PRODUCTS, productId), productData);

        const productIndex = allProducts.findIndex(product => product.id === productId);
        if (productIndex !== -1) {
            allProducts[productIndex] = { id: productId, ...productData };
        }

        renderProductsTab();
        return true;
    } catch (error) {
        console.error('Ошибка обновления товара:', error);
        alert('Ошибка обновления товара');
        return false;
    } finally {
        hideLoading();
    }
};

const deleteProduct = async (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    if (!confirm(`Удалить товар "${product.name}"?`)) return;

    try {
        showLoading();

        await deleteDoc(doc(firestore, COLLECTIONS.PRODUCTS, productId));

        allProducts = allProducts.filter(product => product.id !== productId);
        updateProductsBadges();
        renderProductsTab();

    } catch (error) {
        console.error('Ошибка удаления товара:', error);
        alert('Ошибка удаления товара');
    } finally {
        hideLoading();
    }
};

window.showOrderDetails = (orderId) => {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    document.getElementById('modal-title').textContent = `Заказ ${order.id}`;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <div class="order-details-modal">
            <div class="modal-order-info">
                <div class="info-item">
                    <div class="info-label">Статус</div>
                    <div class="info-value">${order.status === 'active' ? 'Активен' : 'Завершён'}</div>
                </div>
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
        </div>
    `;

    document.getElementById('modal-actions').innerHTML = '';
    document.getElementById('modal-overlay').style.display = 'flex';
};

window.showCourierDetails = (courierId) => {
    const courier = allCouriers.find(c => c.id === courierId);
    if (!courier) return;

    const courierOrders = allOrders.filter(order => order.courierId === courierId);
    const activeOrdersCount = courierOrders.filter(order => order.status === 'active').length;
    const completedOrders = courierOrders.filter(order => order.status === 'completed');
    const completedOrdersCount = completedOrders.length;
    const totalEarnings = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);

    document.getElementById('modal-title').textContent = `Курьер ${courier.name}`;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <div class="courier-details-modal">
            <div class="modal-courier-info">
                <div class="info-item">
                    <div class="info-label">Имя</div>
                    <div class="info-value">${courier.name}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Логин</div>
                    <div class="info-value">${courier.login}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Статус</div>
                    <div class="info-value">${courier.isActive ? 'Активен' : 'Заблокирован'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Активные заказы</div>
                    <div class="info-value">${activeOrdersCount}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Выполненные заказы</div>
                    <div class="info-value">${completedOrdersCount}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Общая сумма</div>
                    <div class="info-value">${formatPrice(totalEarnings)} ₽</div>
                </div>
            </div>
            
            ${courierOrders.length > 0 ? `
            <div class="modal-courier-orders">
                <h4>Последние заказы:</h4>
                ${courierOrders.slice(0, 5).map(order => `
                    <div class="order-row">
                        <span>${order.id}</span>
                        <span>Палатка ${order.tentNumber}</span>
                        <span>${formatPrice(order.total)} ₽</span>
                        <span class="order-status ${order.status}">
                            ${order.status === 'active' ? 'Активен' : 'Завершён'}
                        </span>
                    </div>
                `).join('')}
            </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modal-actions').innerHTML = `
        <button class="action-btn ${courier.isActive ? 'danger' : 'success'}" 
                onclick="closeModal(); toggleCourierStatus('${courier.id}', ${!courier.isActive})">
            ${courier.isActive ? 'Заблокировать' : 'Активировать'}
        </button>
        <button class="action-btn danger" 
                onclick="closeModal(); deleteCourier('${courier.id}')">
            Удалить
        </button>
    `;

    document.getElementById('modal-overlay').style.display = 'flex';
};

window.showProductDetails = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('modal-title').textContent = `Товар ${product.name}`;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <div class="product-details-modal">
            <div class="modal-product-info">
                <div class="info-item">
                    <div class="info-label">Название</div>
                    <div class="info-value">${product.name}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Цена</div>
                    <div class="info-value">${formatPrice(product.price)} ₽</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Остаток</div>
                    <div class="info-value">${product.stock} шт.</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modal-actions').innerHTML = `
        <button class="action-btn" onclick="closeModal(); showEditProductModal('${product.id}')">
            Редактировать
        </button>
        <button class="action-btn danger" onclick="closeModal(); deleteProduct('${product.id}')">
            Удалить
        </button>
    `;

    document.getElementById('modal-overlay').style.display = 'flex';
};

window.showCreateProductModal = () => {
    document.getElementById('modal-title').textContent = 'Создать товар';

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <form id="product-create-form">
            <div class="form-group">
                <label for="product-create-name">Название товара</label>
                <input type="text" id="product-create-name" required placeholder="Введите название">
            </div>
            <div class="form-group">
                <label for="product-create-price">Цена (₽)</label>
                <input type="number" id="product-create-price" required min="1" placeholder="Введите цену">
            </div>
            <div class="form-group">
                <label for="product-create-stock">Количество</label>
                <input type="number" id="product-create-stock" required min="0" placeholder="Введите количество">
            </div>
        </form>
    `;

    document.getElementById('modal-actions').innerHTML = `
        <button class="action-btn" onclick="submitCreateProduct()">Создать</button>
        <button class="action-btn secondary" onclick="closeModal()">Отмена</button>
    `;

    document.getElementById('modal-overlay').style.display = 'flex';
};

window.showEditProductModal = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('modal-title').textContent = `Редактировать ${product.name}`;

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <form id="product-edit-form">
            <div class="form-group">
                <label for="product-edit-name">Название товара</label>
                <input type="text" id="product-edit-name" required value="${product.name}">
            </div>
            <div class="form-group">
                <label for="product-edit-price">Цена (₽)</label>
                <input type="number" id="product-edit-price" required min="1" value="${product.price}">
            </div>
            <div class="form-group">
                <label for="product-edit-stock">Количество</label>
                <input type="number" id="product-edit-stock" required min="0" value="${product.stock}">
            </div>
        </form>
    `;

    document.getElementById('modal-actions').innerHTML = `
        <button class="action-btn" onclick="submitEditProduct('${productId}')">Сохранить</button>
        <button class="action-btn secondary" onclick="closeModal()">Отмена</button>
    `;

    document.getElementById('modal-overlay').style.display = 'flex';
};

window.submitCreateProduct = async () => {
    const name = document.getElementById('product-create-name').value.trim();
    const price = parseInt(document.getElementById('product-create-price').value);
    const stock = parseInt(document.getElementById('product-create-stock').value);

    if (!name || !price || isNaN(stock)) {
        alert('Заполните все поля корректно');
        return;
    }

    const existingProduct = allProducts.find(product => product.name === name);
    if (existingProduct) {
        alert('Товар с таким названием уже существует');
        return;
    }

    const success = await createProduct({ name, price, stock });
    if (success) {
        closeModal();
        alert('Товар успешно создан');
    }
};

window.submitEditProduct = async (productId) => {
    const name = document.getElementById('product-edit-name').value.trim();
    const price = parseInt(document.getElementById('product-edit-price').value);
    const stock = parseInt(document.getElementById('product-edit-stock').value);

    if (!name || !price || isNaN(stock)) {
        alert('Заполните все поля корректно');
        return;
    }

    const existingProduct = allProducts.find(product => product.name === name && product.id !== productId);
    if (existingProduct) {
        alert('Товар с таким названием уже существует');
        return;
    }

    const success = await updateProduct(productId, { name, price, stock });
    if (success) {
        closeModal();
        alert('Товар успешно обновлен');
    }
};

window.closeModal = () => {
    document.getElementById('modal-overlay').style.display = 'none';
};

window.loadAllData = loadAllData;
window.logout = logout;
window.toggleCourierStatus = toggleCourierStatus;
window.deleteCourier = deleteCourier;
window.deleteProduct = deleteProduct;

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        currentUser = user;
        showAdminPanel();
    } else if (user && !user.emailVerified) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('email-verification').style.display = 'flex';
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('email-verification').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', login);
    document.getElementById('courier-form').addEventListener('submit', createCourier);

    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    });
});