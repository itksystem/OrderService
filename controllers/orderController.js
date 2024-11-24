const { DateTime }    = require('luxon');
const orderHelper = require('../helpers/OrderHelper');
const common       = require('openfsm-common');  /* Библиотека с общими параметрами */
const OrderDto   = require('openfsm-order-dto');
const WarehouseServiceClientHandler   = require('openfsm-warehouse-service-client-handler');
const warehouseClient   = new WarehouseServiceClientHandler();
const CommonFunctionHelper = require("openfsm-common-functions")
const commonFunction= new CommonFunctionHelper();
const authMiddleware = require('openfsm-middlewares-auth-service'); // middleware для проверки токена
const ClientProducerAMQP  =  require('openfsm-client-producer-amqp'); // ходим в почту через шину
const { v4: uuidv4 } = require('uuid'); 

/* Коннектор для шины RabbitMQ */
const { RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_COMPLETED_ACTION_QUEUE, RABBITMQ_FAILED_ACTION_QUEUE } = process.env;
/*
const amqp = require('amqplib');

const login = RABBITMQ_USER || 'guest';
const pwd = RABBITMQ_PASSWORD || 'guest';
const completed_queue = RABBITMQ_COMPLETED_ACTION_QUEUE || 'PAYMENT_COMPLETED_ACTION';
const failed_queue = RABBITMQ_FAILED_ACTION_QUEUE || 'PAYMENT_FAILED_ACTION';
const host = RABBITMQ_HOST || 'localhost';
const port = RABBITMQ_PORT || '5672';
*/


require('dotenv').config();


const isValidUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const validateRequest = (productId, quantity, userId) => {
    if (!productId || !isValidUUID(productId)) return "Invalid product ID";
    if (!quantity || typeof quantity !== "number" || quantity <= 0) return "Invalid quantity";
    if (!userId ) return "Invalid user ID";
    return null;
};

const sendResponse = (res, statusCode, data) => {
    res.status(statusCode).json(data);
};


exports.create = async (req, res) => {    
    let {referenceId} =  req.body;
    if (!referenceId ) return sendResponse(res, 400, { message: "Invalid referenceId" });         
    let userId = await authMiddleware.getUserId(req, res);
    if (!userId ) return sendResponse(res, 400, { message: "Invalid user ID" });         
    try {
// проверили количество в корзине         
        const basketCount =
             await warehouseClient.getBasket(commonFunction.getJwtToken(req));
        if(!basketCount 
            || basketCount.data.basket.length == 0) 
                throw(404)
// проверили доступность товаров                
        const productAvailability =     
            await warehouseClient.productAvailability(commonFunction.getJwtToken(req)); // проверка на доступность товара
        if(!productAvailability || !productAvailability?.data?.availabilityStatus)
            throw(409)

// Создаем заказ
        let order = new OrderDto(await orderHelper.create(userId, referenceId ));
        if (!order) 
             throw(common.HTTP_CODES.SERVICE_UNAVAILABLE)

// привязали товары в корзине к заказу        
        const warehouseClientResponse = 
            await warehouseClient.createOrder( commonFunction.getJwtToken(req),  { orderId : order.getOrderId()});
        if(!warehouseClientResponse.success) 
             throw(warehouseClientResponse.status)

// посчитали сумму заказа            
        order.setTotalAmount(warehouseClientResponse.data.totalAmount);

// Отправили заказ на обработку службами
        await exports.processMessage( process.env.RABBITMQ_COMPLETED_ACTION_QUEUE, 'PAYMENT_COMPLETED', order )        

// Ответили фронту об успехе        
        sendResponse(res, 200, { status: true,  order });
    } catch (error) {
         console.error("Error create:", error);
// Отправили ОТМЕНУ заказа на обработку службами        
         try {
            await exports.processMessage( process.env.RABBITMQ_FAILED_ACTION_QUEUE, 'PAYMENT_FAILED', order )         
              } catch (error) {            
        }
// Ответили фронту о НЕУДАЧЕ        
         sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};


exports.decline = async (req, res) => {    
    let userId = await authMiddleware.getUserId(req, res);
    let orderId = req.body.orderId;
    if (!userId) {  console.log("Invalid user ID");  throw(400); }
    if (!orderId) {  console.log("Invalid order ID" ); throw(400); }
    try {
        let result = await orderHelper.decline(orderId, userId);        
        let order = new OrderDto(await orderHelper.getOrder(orderId, userId));
        if (!result) throw(422);
        sendResponse(res, 200, { status: true,  order  });
    } catch (error) {
        console.error("Error decline:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};

exports.getOrders = async (req, res) => {    
    let userId = await authMiddleware.getUserId(req, res);
    if (!userId) { 
        console.log("Invalid user ID");  throw(400);
    }   
    try {
        let orders = await orderHelper.getOrders(userId);
        if (!orders) throw(422)
        sendResponse(res, 200, { status: true, orders : orders.map(id => new OrderDto(id)),});
    } catch (error) {
        console.error("Error getOrders:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};

exports.getOrder = async (req, res) => {    
    let userId = await authMiddleware.getUserId(req, res);
    let orderId = req.params.id;
    if (!userId) {  console.log("Invalid user ID");  throw(400); }
    if (!orderId) {  console.log("Invalid order ID" ); throw(400); }
    try {
        let order = await orderHelper.getOrder(orderId, userId);
        if (!order) return sendResponse(res, 204, { status: false, order : {} });        
        sendResponse(res, 200, { status: true,  order : new OrderDto(order), });
    } catch (error) {
        console.error("Error getOrder:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};

  // Основная функция для обработки сообщения из очереди
  exports.processMessage = async (queue, process, msg) => {    
    try {
         const rabbitClient = new ClientProducerAMQP( process,  process.env.RABBITMQ_USER,   process.env.RABBITMQ_PASSWORD  );
         await  rabbitClient.sendMessage(queue, {process, msg })  
      } catch (error) {            
        throw(error)
    }
  }
  