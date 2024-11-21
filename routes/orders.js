const express = require('express');
const 
router = express.Router();
const common = require("openfsm-common"); /* Библиотека с общими параметрами */
const authMiddleware = require('openfsm-middlewares-auth-service'); // middleware для проверки токена
const order = require('../controllers/orderController');


router.post('/v1/order/create', authMiddleware.authenticateToken, order.create);  // Добавить товар в корзине
router.post('/v1/order/decline', authMiddleware.authenticateToken, order.decline); // Отменить заказ
router.get('/v1/orders', authMiddleware.authenticateToken, order.getOrders); // Получить список заказов
router.get('/v1/order/:id', authMiddleware.authenticateToken, order.getOrder); // Получить заказ



module.exports = router;
