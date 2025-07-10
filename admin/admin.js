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
let currentPeriod = 'month';
let filteredOrders = [];
let filteredCouriers = [];
let filteredProducts = [];

let ordersChart = null;
let revenueChart = null;
let productsChart = null;

const showLoading = () => {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'flex';
};

const hideLoading = () => {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
};

const showError = (message) => {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => errorEl.style.display = 'none', 5000);
    }
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

const formatPrice = (price) => new Intl.NumberFormat('ru-RU').format(price);

const generateCourierId = () => 'courier_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const generateProductId = () => 'product_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const filterDataByPeriod = (data, period) => {
    const now = Date.now();
    let startTime = 0;

    switch (period) {
        case 'today':
            startTime = new Date().setHours(0, 0, 0, 0);
            break;
        case 'week':
            startTime = now - (7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startTime = now - (30 * 24 * 60 * 60 * 1000);
            break;
        case 'quarter':
            startTime = now - (90 * 24 * 60 * 60 * 1000);
            break;
        case 'year':
            startTime = now - (365 * 24 * 60 * 60 * 1000);
            break;
        default:
            return data;
    }

    return data.filter(item => (item.createdAt || 0) >= startTime);
};

const calculateAnalytics = (orders, period = 'month') => {
    const periodOrders = filterDataByPeriod(orders, period);
    const completedOrders = periodOrders.filter(order => order.status === 'completed');

    const totalRevenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const averageOrder = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    const dailyRevenue = period === 'today' ? totalRevenue : totalRevenue / 30;

    const previousPeriodStart = period === 'today' ?
        new Date().setHours(0, 0, 0, 0) - (24 * 60 * 60 * 1000) :
        Date.now() - (60 * 24 * 60 * 60 * 1000);

    const previousOrders = orders.filter(order =>
        (order.createdAt || 0) >= previousPeriodStart &&
        (order.createdAt || 0) < (Date.now() - (30 * 24 * 60 * 60 * 1000))
    );

    const previousRevenue = previousOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const revenueGrowth = previousRevenue > 0 ?
        ((totalRevenue - previousRevenue) / previousRevenue * 100).toFixed(1) : 0;

    return {
        totalRevenue,
        averageOrder,
        dailyRevenue,
        revenueGrowth,
        totalOrders: periodOrders.length,
        completedOrders: completedOrders.length,
        activeOrders: periodOrders.filter(order => order.status === 'active').length,
        ordersGrowth: previousOrders.length > 0 ?
            ((periodOrders.length - previousOrders.length) / previousOrders.length * 100).toFixed(1) : 0
    };
};

const calculateCourierAnalytics = (orders, couriers) => {
    return couriers.map(courier => {
        const courierOrders = orders.filter(order => order.courierId === courier.id);
        const completedOrders = courierOrders.filter(order => order.status === 'completed');
        const activeOrders = courierOrders.filter(order => order.status === 'active');

        const totalEarnings = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        const averageDeliveryTime = completedOrders.length > 0 ?
            completedOrders.reduce((sum, order) => {
                if (order.takenAt && order.deliveredAt) {
                    return sum + (order.deliveredAt - order.takenAt);
                }
                return sum;
            }, 0) / completedOrders.length / (60 * 1000) : 0;

        const efficiency = courierOrders.length > 0 ?
            (completedOrders.length / courierOrders.length * 100).toFixed(1) : 0;

        return {
            ...courier,
            totalOrders: courierOrders.length,
            completedOrders: completedOrders.length,
            activeOrders: activeOrders.length,
            totalEarnings,
            averageDeliveryTime: Math.round(averageDeliveryTime),
            efficiency: parseFloat(efficiency)
        };
    });
};

const calculateProductAnalytics = (orders, products) => {
    const productStats = {};

    orders.forEach(order => {
        if (order.items) {
            order.items.forEach(item => {
                if (!productStats[item.name]) {
                    productStats[item.name] = {
                        name: item.name,
                        totalSold: 0,
                        totalRevenue: 0,
                        orders: 0
                    };
                }
                productStats[item.name].totalSold += item.quantity;
                productStats[item.name].totalRevenue += item.price * item.quantity;
                productStats[item.name].orders++;
            });
        }
    });

    return Object.values(productStats).sort((a, b) => b.totalRevenue - a.totalRevenue);
};

const login = async (event) => {
    event.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value.trim();

    if (!email || !password) {
        showError('Заполните все поля');
        return;
    }

    try {
        showLoading();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            // Отправляем письмо с подтверждением
            try {
                await sendEmailVerification(user);
                console.log('Письмо с подтверждением отправлено');
            } catch (verificationError) {
                console.error('Ошибка отправки письма:', verificationError);
            }

            // Показываем экран подтверждения
            const authScreen = document.getElementById('auth-screen');
            const emailVerification = document.getElementById('email-verification');
            if (authScreen) authScreen.style.display = 'none';
            if (emailVerification) emailVerification.style.display = 'flex';
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
        } else if (error.code === 'auth/invalid-email') {
            showError('Неверный формат email');
        } else if (error.code === 'auth/user-disabled') {
            showError('Аккаунт заблокирован');
        } else {
            showError('Ошибка авторизации: ' + error.message);
        }
    } finally {
        hideLoading();
    }
};

const logout = async () => {
    try {
        await signOut(auth);
        if (ordersListener) ordersListener();
        currentUser = null;

        // Скрываем все экраны
        const authScreen = document.getElementById('auth-screen');
        const adminPanel = document.getElementById('admin-panel');
        const emailVerification = document.getElementById('email-verification');
        const loginForm = document.getElementById('login-form');

        if (authScreen) authScreen.style.display = 'flex';
        if (adminPanel) adminPanel.style.display = 'none';
        if (emailVerification) emailVerification.style.display = 'none';
        if (loginForm) loginForm.reset();

        // Очищаем поля ввода
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
};

const showAdminPanel = () => {
    const authScreen = document.getElementById('auth-screen');
    const emailVerification = document.getElementById('email-verification');
    const adminPanel = document.getElementById('admin-panel');
    const adminEmail = document.getElementById('admin-email');

    if (authScreen) authScreen.style.display = 'none';
    if (emailVerification) emailVerification.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'flex';
    if (adminEmail && currentUser) adminEmail.textContent = currentUser.email;

    loadAllData();
    startOrdersListener();
};

// Функция для повторной отправки письма с подтверждением
window.resendVerification = async () => {
    try {
        showLoading();
        const user = auth.currentUser;
        if (user) {
            await sendEmailVerification(user);
            alert('Письмо с подтверждением отправлено повторно. Проверьте свою почту.');
        } else {
            alert('Сначала войдите в систему');
        }
    } catch (error) {
        console.error('Ошибка отправки подтверждения:', error);
        if (error.code === 'auth/too-many-requests') {
            alert('Слишком много запросов. Попробуйте позже.');
        } else {
            alert('Ошибка отправки письма: ' + error.message);
        }
    } finally {
        hideLoading();
    }
};

// Функция для возвращения к экрану входа
window.backToLogin = () => {
    const emailVerification = document.getElementById('email-verification');
    const authScreen = document.getElementById('auth-screen');
    if (emailVerification) emailVerification.style.display = 'none';
    if (authScreen) authScreen.style.display = 'flex';
};

window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(section => section.classList.remove('active'));

    const tabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => {
        const text = btn.textContent.toLowerCase();
        if (tabName === 'dashboard') return text.includes('дашборд');
        if (tabName === 'analytics') return text.includes('аналитика');
        if (tabName === 'orders') return text.includes('заказы');
        if (tabName === 'couriers') return text.includes('курьеры') && !text.includes('новый');
        if (tabName === 'products') return text.includes('товары');
        if (tabName === 'create-courier') return text.includes('новый');
        return false;
    });

    if (tabBtn) tabBtn.classList.add('active');
    const section = document.getElementById(`${tabName}-section`);
    if (section) section.classList.add('active');

    activeTab = tabName;

    if (tabName === 'dashboard') {
        renderDashboard();
    } else if (tabName === 'analytics') {
        renderAnalytics();
    } else if (tabName === 'orders') {
        renderOrdersSection();
    } else if (tabName === 'couriers') {
        renderCouriersSection();
    } else if (tabName === 'products') {
        renderProductsSection();
    }
};

window.changePeriod = () => {
    const periodSelector = document.getElementById('period-selector');
    if (periodSelector) {
        currentPeriod = periodSelector.value;
        renderDashboard();
    }
};

window.updateAnalytics = () => {
    renderAnalytics();
};

const loadAllData = async () => {
    await Promise.all([
        loadCouriers(),
        loadOrders(),
        loadProducts()
    ]);
    updateBadges();
    initializeFilters();
    renderDashboard();
};

const loadCouriers = async () => {
    try {
        const snapshot = await getDocs(collection(firestore, COLLECTIONS.COURIERS));
        allCouriers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        allOrders = [];
    }
};

const loadProducts = async () => {
    try {
        const snapshot = await getDocs(collection(firestore, COLLECTIONS.PRODUCTS));
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
    }
};

const startOrdersListener = () => {
    if (ordersListener) ordersListener();

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

        updateBadges();
        initializeFilters();

        if (activeTab === 'dashboard') {
            renderDashboard();
        } else if (activeTab === 'analytics') {
            renderAnalytics();
        } else if (activeTab === 'orders') {
            renderOrdersSection();
        } else if (activeTab === 'couriers') {
            renderCouriersSection();
        }
    });
};

const updateBadges = () => {
    const activeOrders = allOrders.filter(order => order.status === 'active').length;

    const ordersBadge = document.getElementById('orders-badge');
    const couriersBadge = document.getElementById('couriers-badge');
    const productsBadge = document.getElementById('products-badge');

    if (ordersBadge) ordersBadge.textContent = allOrders.length;
    if (couriersBadge) couriersBadge.textContent = allCouriers.length;
    if (productsBadge) productsBadge.textContent = allProducts.length;
};

const initializeFilters = () => {
    filteredOrders = [...allOrders];
    filteredCouriers = [...allCouriers];
    filteredProducts = [...allProducts];
};

const renderDashboard = () => {
    const analytics = calculateAnalytics(allOrders, currentPeriod);
    const activeCouriers = allCouriers.filter(courier => courier.isActive).length;

    const totalRevenue = document.getElementById('total-revenue');
    const totalOrders = document.getElementById('total-orders');
    const activeOrdersEl = document.getElementById('active-orders');
    const activeCouriersEl = document.getElementById('active-couriers');

    if (totalRevenue) totalRevenue.textContent = `${formatPrice(analytics.totalRevenue)} ₽`;
    if (totalOrders) totalOrders.textContent = analytics.totalOrders;
    if (activeOrdersEl) activeOrdersEl.textContent = analytics.activeOrders;
    if (activeCouriersEl) activeCouriersEl.textContent = activeCouriers;

    const revenueChange = document.getElementById('revenue-change');
    const ordersChange = document.getElementById('orders-change');
    const activeChange = document.getElementById('active-change');
    const couriersChange = document.getElementById('couriers-change');

    if (revenueChange) revenueChange.textContent = `${analytics.revenueGrowth >= 0 ? '+' : ''}${analytics.revenueGrowth}%`;
    if (ordersChange) ordersChange.textContent = `${analytics.ordersGrowth >= 0 ? '+' : ''}${analytics.ordersGrowth}%`;
    if (activeChange) activeChange.textContent = `${analytics.activeOrders}`;
    if (couriersChange) couriersChange.textContent = `${activeCouriers}`;

    renderOrdersChart();
    renderTopProducts();
    renderTopCouriers();
    renderRecentOrders();
};

const renderOrdersChart = () => {
    const ctx = document.getElementById('ordersChart');
    if (!ctx) return;

    const periodOrders = filterDataByPeriod(allOrders, currentPeriod);
    const chartData = generateChartData(periodOrders, currentPeriod);

    if (ordersChart) {
        ordersChart.destroy();
    }

    ordersChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Заказы',
                data: chartData.data,
                borderColor: '#20B2AA',
                backgroundColor: 'rgba(32, 178, 170, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
};

const generateChartData = (orders, period) => {
    const labels = [];
    const data = [];

    const now = new Date();
    let days = 30;

    switch (period) {
        case 'today':
            days = 1;
            break;
        case 'week':
            days = 7;
            break;
        case 'month':
            days = 30;
            break;
    }

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        const dayStart = new Date(date).setHours(0, 0, 0, 0);
        const dayEnd = new Date(date).setHours(23, 59, 59, 999);

        const dayOrders = orders.filter(order =>
            order.createdAt >= dayStart && order.createdAt <= dayEnd
        ).length;

        labels.push(date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit'
        }));
        data.push(dayOrders);
    }

    return { labels, data };
};

const renderTopProducts = () => {
    const productAnalytics = calculateProductAnalytics(allOrders, allProducts);
    const container = document.getElementById('top-products-list');

    if (!container) return;

    if (productAnalytics.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет данных о продажах</div>';
        return;
    }

    container.innerHTML = productAnalytics.slice(0, 5).map((product, index) => `
        <div class="top-item fade-in">
            <div class="item-info">
                <div class="item-rank ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">${index + 1}</div>
                <div class="item-details">
                    <h4>${product.name}</h4>
                    <p>Продано: ${product.totalSold} шт. • Заказов: ${product.orders}</p>
                </div>
            </div>
            <div class="item-value">${formatPrice(product.totalRevenue)} ₽</div>
        </div>
    `).join('');
};

const renderTopCouriers = () => {
    const courierAnalytics = calculateCourierAnalytics(allOrders, allCouriers);
    const topCouriers = courierAnalytics
        .sort((a, b) => b.completedOrders - a.completedOrders)
        .slice(0, 5);

    const container = document.getElementById('top-couriers-list');

    if (!container) return;

    if (topCouriers.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет активных курьеров</div>';
        return;
    }

    container.innerHTML = topCouriers.map((courier, index) => `
        <div class="courier-item fade-in" onclick="showCourierDetails('${courier.id}')">
            <div class="item-info">
                <div class="item-rank ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">${index + 1}</div>
                <div class="item-details">
                    <h4>${courier.name}</h4>
                    <p>Выполнено: ${courier.completedOrders} • Эффективность: ${courier.efficiency}%</p>
                </div>
            </div>
            <div class="item-value">${formatPrice(courier.totalEarnings)} ₽</div>
        </div>
    `).join('');
};

const renderRecentOrders = () => {
    const recentOrders = allOrders.slice(0, 8);
    const container = document.getElementById('recent-orders-list');

    if (!container) return;

    if (recentOrders.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет заказов</div>';
        return;
    }

    container.innerHTML = recentOrders.map(order => `
        <div class="recent-order-item fade-in" onclick="showOrderDetails('${order.id}')">
            <div class="item-info">
                <div class="item-details">
                    <h4>${order.id}</h4>
                    <p>Палатка: ${order.tentNumber} • ${formatTime(order.createdAt)}</p>
                </div>
            </div>
            <div class="item-value">${formatPrice(order.total)} ₽</div>
        </div>
    `).join('');
};

const renderAnalytics = () => {
    const period = document.getElementById('analytics-period')?.value || 'month';
    const analytics = calculateAnalytics(allOrders, period);

    const totalTurnover = document.getElementById('total-turnover');
    const averageOrder = document.getElementById('average-order');
    const dailyRevenue = document.getElementById('daily-revenue');
    const revenueGrowth = document.getElementById('revenue-growth');

    if (totalTurnover) totalTurnover.textContent = `${formatPrice(analytics.totalRevenue)} ₽`;
    if (averageOrder) averageOrder.textContent = `${formatPrice(analytics.averageOrder)} ₽`;
    if (dailyRevenue) dailyRevenue.textContent = `${formatPrice(analytics.dailyRevenue)} ₽`;
    if (revenueGrowth) revenueGrowth.textContent = `${analytics.revenueGrowth >= 0 ? '+' : ''}${analytics.revenueGrowth}%`;

    renderRevenueChart(period);
    renderProductsChart();
    renderCouriersPerformance();
    renderAnalyticsTable();
};

const renderRevenueChart = (period) => {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const periodOrders = filterDataByPeriod(allOrders, period);
    const revenueData = generateRevenueChartData(periodOrders, period);

    if (revenueChart) {
        revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: revenueData.labels,
            datasets: [{
                label: 'Выручка',
                data: revenueData.data,
                backgroundColor: 'rgba(32, 178, 170, 0.7)',
                borderColor: '#20B2AA',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return formatPrice(value) + ' ₽';
                        }
                    }
                }
            }
        }
    });
};

const generateRevenueChartData = (orders, period) => {
    const labels = [];
    const data = [];

    const now = new Date();
    let days = 30;

    switch (period) {
        case 'week':
            days = 7;
            break;
        case 'month':
            days = 30;
            break;
        case 'quarter':
            days = 90;
            break;
        case 'year':
            days = 365;
            break;
    }

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        const dayStart = new Date(date).setHours(0, 0, 0, 0);
        const dayEnd = new Date(date).setHours(23, 59, 59, 999);

        const dayRevenue = orders
            .filter(order => order.createdAt >= dayStart && order.createdAt <= dayEnd && order.status === 'completed')
            .reduce((sum, order) => sum + (order.total || 0), 0);

        labels.push(date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit'
        }));
        data.push(dayRevenue);
    }

    return { labels, data };
};

const renderProductsChart = () => {
    const ctx = document.getElementById('productsChart');
    if (!ctx) return;

    const productAnalytics = calculateProductAnalytics(allOrders, allProducts);
    const topProducts = productAnalytics.slice(0, 5);

    if (productsChart) {
        productsChart.destroy();
    }

    productsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: topProducts.map(p => p.name),
            datasets: [{
                data: topProducts.map(p => p.totalSold),
                backgroundColor: [
                    '#20B2AA',
                    '#17a2b8',
                    '#28a745',
                    '#FF6B35',
                    '#6f42c1'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
};

const renderCouriersPerformance = () => {
    const courierAnalytics = calculateCourierAnalytics(allOrders, allCouriers);
    const container = document.getElementById('couriers-performance');

    if (!container) return;

    if (courierAnalytics.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет курьеров</div>';
        return;
    }

    container.innerHTML = courierAnalytics
        .sort((a, b) => b.efficiency - a.efficiency)
        .map(courier => `
            <div class="courier-performance-item">
                <div class="courier-performance-info">
                    <div class="courier-avatar">${courier.name.charAt(0).toUpperCase()}</div>
                    <div class="item-details">
                        <h4>${courier.name}</h4>
                        <p>${courier.isActive ? 'Активен' : 'Неактивен'}</p>
                    </div>
                </div>
                <div class="courier-stats">
                    <div class="courier-stat">
                        <div class="courier-stat-value">${courier.completedOrders}</div>
                        <div class="courier-stat-label">Выполнено</div>
                    </div>
                    <div class="courier-stat">
                        <div class="courier-stat-value">${courier.efficiency}%</div>
                        <div class="courier-stat-label">Эффективность</div>
                    </div>
                    <div class="courier-stat">
                        <div class="courier-stat-value">${courier.averageDeliveryTime}м</div>
                        <div class="courier-stat-label">Среднее время</div>
                    </div>
                    <div class="courier-stat">
                        <div class="courier-stat-value">${formatPrice(courier.totalEarnings)}₽</div>
                        <div class="courier-stat-label">Заработано</div>
                    </div>
                </div>
            </div>
        `).join('');
};

const renderAnalyticsTable = () => {
    const courierAnalytics = calculateCourierAnalytics(allOrders, allCouriers);
    const container = document.getElementById('analytics-table');

    if (!container) return;

    if (courierAnalytics.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет данных</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-header">
            <div class="table-cell">Курьер</div>
            <div class="table-cell">Заказы</div>
            <div class="table-cell">Эффективность</div>
            <div class="table-cell">Среднее время</div>
            <div class="table-cell">Заработано</div>
        </div>
        ${courierAnalytics.map(courier => `
            <div class="table-row">
                <div class="table-cell">
                    <strong>${courier.name}</strong><br>
                    <small>${courier.isActive ? 'Активен' : 'Неактивен'}</small>
                </div>
                <div class="table-cell">${courier.completedOrders}/${courier.totalOrders}</div>
                <div class="table-cell">${courier.efficiency}%</div>
                <div class="table-cell">${courier.averageDeliveryTime} мин</div>
                <div class="table-cell">${formatPrice(courier.totalEarnings)} ₽</div>
            </div>
        `).join('')}
    `;
};

const renderOrdersSection = () => {
    updateOrdersStats();
    renderOrdersList();
};

const updateOrdersStats = () => {
    const filteredOrdersCount = document.getElementById('filtered-orders-count');
    const filteredOrdersSum = document.getElementById('filtered-orders-sum');
    const avgDeliveryTime = document.getElementById('avg-delivery-time');

    if (filteredOrdersCount) filteredOrdersCount.textContent = filteredOrders.length;

    const totalSum = filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    if (filteredOrdersSum) filteredOrdersSum.textContent = `${formatPrice(totalSum)} ₽`;

    const completedOrders = filteredOrders.filter(order =>
        order.status === 'completed' && order.takenAt && order.deliveredAt
    );

    const avgTime = completedOrders.length > 0 ?
        completedOrders.reduce((sum, order) => {
            return sum + (order.deliveredAt - order.takenAt);
        }, 0) / completedOrders.length / (60 * 1000) : 0;

    if (avgDeliveryTime) avgDeliveryTime.textContent = `${Math.round(avgTime)} мин`;
};

const renderOrdersList = () => {
    const container = document.getElementById('orders-list');

    if (!container) return;

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
                ${order.deliveredAt ? `
                <div class="info-item">
                    <div class="info-label">Доставлен</div>
                    <div class="info-value">${formatTime(order.deliveredAt)}</div>
                </div>
                ` : ''}
            </div>
            <div class="order-items-preview">
                <h4>Товары:</h4>
                ${order.items ? order.items.map(item => `
                    <div class="order-item-row">
                        <span>${item.name} × ${item.quantity}</span>
                        <span>${formatPrice(item.price * item.quantity)} ₽</span>
                    </div>
                `).join('') : ''}
            </div>
        </div>
    `).join('');
};

const renderCouriersSection = () => {
    updateCouriersStats();
    renderCouriersList();
};

const updateCouriersStats = () => {
    const activeCouriers = filteredCouriers.filter(courier => courier.isActive);
    const workingCouriers = allOrders.filter(order =>
        order.status === 'active' && order.courierId
    ).map(order => order.courierId);
    const uniqueWorking = [...new Set(workingCouriers)].length;

    const courierAnalytics = calculateCourierAnalytics(allOrders, filteredCouriers);
    const avgEfficiency = courierAnalytics.length > 0 ?
        courierAnalytics.reduce((sum, courier) => sum + courier.efficiency, 0) / courierAnalytics.length : 0;

    const totalCouriersStat = document.getElementById('total-couriers-stat');
    const activeCouriersStat = document.getElementById('active-couriers-stat');
    const workingCouriersStat = document.getElementById('working-couriers-stat');
    const couriersEfficiency = document.getElementById('couriers-efficiency');

    if (totalCouriersStat) totalCouriersStat.textContent = filteredCouriers.length;
    if (activeCouriersStat) activeCouriersStat.textContent = activeCouriers.length;
    if (workingCouriersStat) workingCouriersStat.textContent = uniqueWorking;
    if (couriersEfficiency) couriersEfficiency.textContent = `${Math.round(avgEfficiency)}%`;
};

const renderCouriersList = () => {
    const container = document.getElementById('couriers-list');

    if (!container) return;

    if (filteredCouriers.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет курьеров</div>';
        return;
    }

    const courierAnalytics = calculateCourierAnalytics(allOrders, filteredCouriers);

    container.innerHTML = courierAnalytics.map(courier => `
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
                    <div class="info-value">${courier.activeOrders}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Выполнено</div>
                    <div class="info-value">${courier.completedOrders}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Эффективность</div>
                    <div class="info-value">${courier.efficiency}%</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Общая сумма</div>
                    <div class="info-value">${formatPrice(courier.totalEarnings)} ₽</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Среднее время</div>
                    <div class="info-value">${courier.averageDeliveryTime} мин</div>
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
    `).join('');
};

const renderProductsSection = () => {
    updateProductsStats();
    renderProductsList();
};

const updateProductsStats = () => {
    const inStock = filteredProducts.filter(product => product.stock > 0);
    const totalStockValue = filteredProducts.reduce((sum, product) => sum + (product.price * product.stock), 0);

    const productAnalytics = calculateProductAnalytics(allOrders, allProducts);
    const bestSelling = productAnalytics.length > 0 ? productAnalytics[0].name : '-';

    const totalProductsStat = document.getElementById('total-products-stat');
    const productsInStock = document.getElementById('products-in-stock');
    const totalStockValueEl = document.getElementById('total-stock-value');
    const bestSellingProduct = document.getElementById('best-selling-product');

    if (totalProductsStat) totalProductsStat.textContent = filteredProducts.length;
    if (productsInStock) productsInStock.textContent = inStock.length;
    if (totalStockValueEl) totalStockValueEl.textContent = `${formatPrice(totalStockValue)} ₽`;
    if (bestSellingProduct) bestSellingProduct.textContent = bestSelling;
};

const renderProductsList = () => {
    const container = document.getElementById('products-list');

    if (!container) return;

    if (filteredProducts.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет товаров</div>';
        return;
    }

    const productAnalytics = calculateProductAnalytics(allOrders, allProducts);

    container.innerHTML = filteredProducts.map(product => {
        const analytics = productAnalytics.find(p => p.name === product.name);
        const getStockStatus = (stock) => {
            if (stock === 0) return 'out-of-stock';
            if (stock < 10) return 'low-stock';
            return 'in-stock';
        };

        const getStockText = (stock) => {
            if (stock === 0) return 'Нет в наличии';
            if (stock < 10) return 'Заканчивается';
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
                    <div class="info-item">
                        <div class="info-label">Стоимость остатков</div>
                        <div class="info-value">${formatPrice(product.price * product.stock)} ₽</div>
                    </div>
                    ${analytics ? `
                    <div class="info-item">
                        <div class="info-label">Продано всего</div>
                        <div class="info-value">${analytics.totalSold} шт.</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Выручка</div>
                        <div class="info-value">${formatPrice(analytics.totalRevenue)} ₽</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Заказов</div>
                        <div class="info-value">${analytics.orders}</div>
                    </div>
                    ` : ''}
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

window.filterOrders = () => {
    const search = document.getElementById('orders-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('orders-filter')?.value || 'all';

    filteredOrders = allOrders.filter(order => {
        const matchesSearch = !search ||
            order.id.toLowerCase().includes(search) ||
            order.tentNumber.toLowerCase().includes(search) ||
            (order.courierName && order.courierName.toLowerCase().includes(search));

        const matchesFilter = filter === 'all' ||
            (filter === 'active' && order.status === 'active') ||
            (filter === 'completed' && order.status === 'completed') ||
            (filter === 'today' && new Date(order.createdAt).toDateString() === new Date().toDateString());

        return matchesSearch && matchesFilter;
    });

    renderOrdersList();
    updateOrdersStats();
};

window.filterCouriers = () => {
    const search = document.getElementById('couriers-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('couriers-filter')?.value || 'all';

    filteredCouriers = allCouriers.filter(courier => {
        const matchesSearch = !search ||
            courier.name.toLowerCase().includes(search) ||
            courier.login.toLowerCase().includes(search);

        const matchesFilter = filter === 'all' ||
            (filter === 'active' && courier.isActive) ||
            (filter === 'blocked' && !courier.isActive) ||
            (filter === 'online' && courier.isActive);

        return matchesSearch && matchesFilter;
    });

    renderCouriersList();
    updateCouriersStats();
};

window.filterProducts = () => {
    const search = document.getElementById('products-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('products-filter')?.value || 'all';

    filteredProducts = allProducts.filter(product => {
        const matchesSearch = !search ||
            product.name.toLowerCase().includes(search);

        const matchesFilter = filter === 'all' ||
            (filter === 'in-stock' && product.stock > 0) ||
            (filter === 'low-stock' && product.stock > 0 && product.stock < 10) ||
            (filter === 'out-of-stock' && product.stock === 0);

        return matchesSearch && matchesFilter;
    });

    renderProductsList();
    updateProductsStats();
};

window.exportOrders = () => {
    const csvData = [
        ['ID', 'Палатка', 'Сумма', 'Статус', 'Курьер', 'Создан', 'Доставлен'].join(','),
        ...filteredOrders.map(order => [
            order.id,
            order.tentNumber,
            order.total,
            order.status,
            order.courierName || '',
            formatTime(order.createdAt),
            order.deliveredAt ? formatTime(order.deliveredAt) : ''
        ].join(','))
    ].join('\n');

    downloadCSV(csvData, 'orders.csv');
};

window.exportCouriers = () => {
    const courierAnalytics = calculateCourierAnalytics(allOrders, filteredCouriers);
    const csvData = [
        ['Имя', 'Логин', 'Статус', 'Заказы', 'Выполнено', 'Эффективность', 'Заработано'].join(','),
        ...courierAnalytics.map(courier => [
            courier.name,
            courier.login,
            courier.isActive ? 'Активен' : 'Заблокирован',
            courier.totalOrders,
            courier.completedOrders,
            `${courier.efficiency}%`,
            courier.totalEarnings
        ].join(','))
    ].join('\n');

    downloadCSV(csvData, 'couriers.csv');
};

window.exportProducts = () => {
    const productAnalytics = calculateProductAnalytics(allOrders, allProducts);
    const csvData = [
        ['Название', 'Цена', 'Остаток', 'Продано', 'Выручка'].join(','),
        ...filteredProducts.map(product => {
            const analytics = productAnalytics.find(p => p.name === product.name);
            return [
                product.name,
                product.price,
                product.stock,
                analytics ? analytics.totalSold : 0,
                analytics ? analytics.totalRevenue : 0
            ].join(',');
        })
    ].join('\n');

    downloadCSV(csvData, 'products.csv');
};

const downloadCSV = (data, filename) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const createCourier = async (event) => {
    event.preventDefault();

    const name = document.getElementById('courier-name')?.value.trim();
    const login = document.getElementById('courier-login')?.value.trim();
    const password = document.getElementById('courier-password')?.value.trim();
    const phone = document.getElementById('courier-phone')?.value.trim() || '';
    const isActive = document.getElementById('courier-active')?.checked || false;

    if (!name || !login || !password) {
        alert('Заполните все обязательные поля');
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
            name,
            login,
            password,
            phone,
            isActive
        };

        await setDoc(doc(firestore, COLLECTIONS.COURIERS, courierId), courierData);

        allCouriers.push({ id: courierId, ...courierData });
        updateBadges();

        const courierForm = document.getElementById('courier-form');
        const courierActive = document.getElementById('courier-active');

        if (courierForm) courierForm.reset();
        if (courierActive) courierActive.checked = true;

        alert('Курьер успешно создан');

        if (activeTab === 'couriers') {
            initializeFilters();
            renderCouriersSection();
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

        initializeFilters();
        renderCouriersSection();

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
        updateBadges();
        initializeFilters();
        renderCouriersSection();

    } catch (error) {
        console.error('Ошибка удаления курьера:', error);
        alert('Ошибка удаления курьера');
    } finally {
        hideLoading();
    }
};

const createProduct = async (productData) => {
    try {
        showLoading();

        const productId = generateProductId();
        await setDoc(doc(firestore, COLLECTIONS.PRODUCTS, productId), productData);

        allProducts.push({ id: productId, ...productData });
        updateBadges();
        initializeFilters();
        renderProductsSection();

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

        initializeFilters();
        renderProductsSection();
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
        updateBadges();
        initializeFilters();
        renderProductsSection();

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

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    if (modalTitle) modalTitle.textContent = `Заказ ${order.id}`;

    if (modalContent) {
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
                    ${order.items ? order.items.map(item => `
                        <div class="item-row">
                            <span>${item.name} × ${item.quantity}</span>
                            <span>${formatPrice(item.price * item.quantity)} ₽</span>
                        </div>
                    `).join('') : 'Нет товаров'}
                </div>
            </div>
        `;
    }

    if (modalActions) modalActions.innerHTML = '';

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
};

window.showCourierDetails = (courierId) => {
    const courier = allCouriers.find(c => c.id === courierId);
    if (!courier) return;

    const courierAnalytics = calculateCourierAnalytics(allOrders, [courier])[0];
    const courierOrders = allOrders.filter(order => order.courierId === courierId);

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    if (modalTitle) modalTitle.textContent = `Курьер ${courier.name}`;

    if (modalContent) {
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
                        <div class="info-label">Телефон</div>
                        <div class="info-value">${courier.phone || 'Не указан'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Статус</div>
                        <div class="info-value">${courier.isActive ? 'Активен' : 'Заблокирован'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Всего заказов</div>
                        <div class="info-value">${courierAnalytics.totalOrders}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Выполненные заказы</div>
                        <div class="info-value">${courierAnalytics.completedOrders}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Активные заказы</div>
                        <div class="info-value">${courierAnalytics.activeOrders}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Эффективность</div>
                        <div class="info-value">${courierAnalytics.efficiency}%</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Среднее время доставки</div>
                        <div class="info-value">${courierAnalytics.averageDeliveryTime} мин</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Общий заработок</div>
                        <div class="info-value">${formatPrice(courierAnalytics.totalEarnings)} ₽</div>
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
    }

    if (modalActions) {
        modalActions.innerHTML = `
            <button class="action-btn ${courier.isActive ? 'danger' : 'success'}" 
                    onclick="closeModal(); toggleCourierStatus('${courier.id}', ${!courier.isActive})">
                ${courier.isActive ? 'Заблокировать' : 'Активировать'}
            </button>
            <button class="action-btn danger" 
                    onclick="closeModal(); deleteCourier('${courier.id}')">
                Удалить
            </button>
        `;
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
};

window.showProductDetails = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const productAnalytics = calculateProductAnalytics(allOrders, [product]);
    const analytics = productAnalytics.find(p => p.name === product.name);

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    if (modalTitle) modalTitle.textContent = `Товар ${product.name}`;

    if (modalContent) {
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
                    <div class="info-item">
                        <div class="info-label">Стоимость остатков</div>
                        <div class="info-value">${formatPrice(product.price * product.stock)} ₽</div>
                    </div>
                    ${analytics ? `
                    <div class="info-item">
                        <div class="info-label">Продано всего</div>
                        <div class="info-value">${analytics.totalSold} шт.</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Общая выручка</div>
                        <div class="info-value">${formatPrice(analytics.totalRevenue)} ₽</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Количество заказов</div>
                        <div class="info-value">${analytics.orders}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    if (modalActions) {
        modalActions.innerHTML = `
            <button class="action-btn" onclick="closeModal(); showEditProductModal('${product.id}')">
                Редактировать
            </button>
            <button class="action-btn danger" onclick="closeModal(); deleteProduct('${product.id}')">
                Удалить
            </button>
        `;
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
};

window.showCreateProductModal = () => {
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    if (modalTitle) modalTitle.textContent = 'Создать товар';

    if (modalContent) {
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
    }

    if (modalActions) {
        modalActions.innerHTML = `
            <button class="action-btn" onclick="submitCreateProduct()">Создать</button>
            <button class="action-btn secondary" onclick="closeModal()">Отмена</button>
        `;
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
};

window.showEditProductModal = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalActions = document.getElementById('modal-actions');

    if (modalTitle) modalTitle.textContent = `Редактировать ${product.name}`;

    if (modalContent) {
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
    }

    if (modalActions) {
        modalActions.innerHTML = `
            <button class="action-btn" onclick="submitEditProduct('${productId}')">Сохранить</button>
            <button class="action-btn secondary" onclick="closeModal()">Отмена</button>
        `;
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
};

window.submitCreateProduct = async () => {
    const name = document.getElementById('product-create-name')?.value.trim();
    const price = parseInt(document.getElementById('product-create-price')?.value);
    const stock = parseInt(document.getElementById('product-create-stock')?.value);

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
    const name = document.getElementById('product-edit-name')?.value.trim();
    const price = parseInt(document.getElementById('product-edit-price')?.value);
    const stock = parseInt(document.getElementById('product-edit-stock')?.value);

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
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) modalOverlay.style.display = 'none';
};

window.loadAllData = loadAllData;
window.logout = logout;
window.toggleCourierStatus = toggleCourierStatus;
window.deleteCourier = deleteCourier;
window.deleteProduct = deleteProduct;

// Обработчик изменения состояния аутентификации
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (user.emailVerified) {
            // Пользователь авторизован и подтвердил email
            currentUser = user;
            showAdminPanel();
        } else {
            // Пользователь авторизован, но не подтвердил email
            const authScreen = document.getElementById('auth-screen');
            const emailVerification = document.getElementById('email-verification');
            const adminPanel = document.getElementById('admin-panel');

            if (authScreen) authScreen.style.display = 'none';
            if (emailVerification) emailVerification.style.display = 'flex';
            if (adminPanel) adminPanel.style.display = 'none';
        }
    } else {
        // Пользователь не авторизован
        const authScreen = document.getElementById('auth-screen');
        const adminPanel = document.getElementById('admin-panel');
        const emailVerification = document.getElementById('email-verification');

        if (authScreen) authScreen.style.display = 'flex';
        if (adminPanel) adminPanel.style.display = 'none';
        if (emailVerification) emailVerification.style.display = 'none';
    }
});

// Обработчики событий DOM
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const courierForm = document.getElementById('courier-form');
    const modalOverlay = document.getElementById('modal-overlay');

    if (loginForm) loginForm.addEventListener('submit', login);
    if (courierForm) courierForm.addEventListener('submit', createCourier);

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                closeModal();
            }
        });
    }

    // Инициализация фильтров после загрузки данных
    setTimeout(() => {
        if (allOrders.length > 0 || allCouriers.length > 0 || allProducts.length > 0) {
            initializeFilters();
        }
    }, 1000);
});
