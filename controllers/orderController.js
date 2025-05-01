const { DateTime }    = require('luxon');
const orderHelper = require('../helpers/OrderHelper');
const common       = require('openfsm-common');  /* Библиотека с общими параметрами */
const OrderDto   = require('openfsm-order-dto');
const WarehouseServiceClientHandler   = require('openfsm-warehouse-service-client-handler');
const warehouseClient   = new WarehouseServiceClientHandler();
const CommonFunctionHelper = require("openfsm-common-functions")
const commonFunction= new CommonFunctionHelper();
const authMiddleware = require('openfsm-middlewares-auth-service'); // middleware для проверки токена

const logger = require('openfsm-logger-handler');
const { v4: uuidv4 } = require('uuid'); 
require('dotenv').config({ path: '.env-order-service' });
const SUBSCRIBE_TYPE = {
    BEGIN : "BEGIN",
    EXTENDED :   "EXTENDED",
    ADVANCED  : "ADVANCED",
    PROFESSIONAL : "PROFESSIONAL"
}

const isValidUUID = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const validateRequest = (productId, quantity, userId) => {
    if (!productId || !isValidUUID(productId)) return "Invalid product ID";
    if (!quantity || typeof quantity !== "number" || quantity <= 0) return "Invalid quantity";
    if (!userId ) return "Invalid user ID";
    return null;
};

const sendResponse = (res, statusCode, data) => {
    if(statusCode >= 400)
         logger.error(data);
    res.status(statusCode).json(data);
};


exports.create = async (req, res) => {    
    let order;
    let {referenceId} =  req.body;
    if (!referenceId ) return sendResponse(res, 400, { message: "Invalid referenceId" });         
    console.log(`Order.create referenceId => ${referenceId}`);

    let userId = await authMiddleware.getUserId(req, res);
    if (!userId ) return sendResponse(res, 400, { message: "Invalid user ID" });         
     console.log(`Order.create userId => ${userId}`);

    try {
// проверили количество в корзине         
        const basketCount =
             await warehouseClient.getBasket(commonFunction.getJwtToken(req));
        if(!basketCount 
            || basketCount.data.basket.length == 0)                 
                return sendResponse(res, 404, { message: "Basket is empty" });         
        console.log(`Order.create basketCount => `, basketCount);        

// проверили доступность товаров                
        const productAvailability =     
            await warehouseClient.productAvailability(commonFunction.getJwtToken(req)); // проверка на доступность товара
        if(!productAvailability || !productAvailability?.data?.availabilityStatus)            
                return sendResponse(res, 409, { message: "Product count not avaibility" });         
        console.log(`Order.create productAvailability => `, productAvailability);        

// Создаем заказ
        order = new OrderDto(await orderHelper.create(userId, referenceId));
        if (!order) 
             throw(common.HTTP_CODES.SERVICE_UNAVAILABLE)
        console.log(`Order.create order => `, order);        

// привязали товары в корзине к заказу        
        const warehouseClientResponse = 
            await warehouseClient.createOrder( commonFunction.getJwtToken(req),  { orderId : order.getOrderId()});
            console.log(`Order.create warehouseClientResponse => `, warehouseClientResponse);        
        if(!warehouseClientResponse.success)              
             return sendResponse(res, 422, { message: "Basket join to order error " });         
        

// посчитали сумму заказа            
        order.setTotalAmount(warehouseClientResponse.data.totalAmount);
// Ответили фронту об успехе        
        sendResponse(res, 200, { status: true,  order });
    } catch (error) {                         
          orderHelper.decline(orderId, userId);  // откатили транзакцию.
// Ответили фронту о НЕУДАЧЕ       
         logger.error(error);
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
    try {
        // Получаем userId
        let userId = await authMiddleware.getUserId(req, res);
        if (!userId) { 
            console.log("Invalid user ID");
            return sendResponse(res, 400, { status: false, message: "Invalid user ID" });
        }   

        // Получаем заказы
        let orders = await orderHelper.getOrders(userId);
           // Обновляем данные заказов
        let warehouseClient = new WarehouseServiceClientHandler();
        const updatedOrders = await Promise.all(
            orders.map(async (items) => {
                try {
                    let o = new OrderDto(items);
                    console.log(`o`,o)
                    try {
                        let orderDetails = await warehouseClient.getOrderDetails(commonFunction.getJwtToken(req), o.getOrderId());
                        console.log(`orderDetails`,orderDetails)    
                        let totalQuantity = orderDetails?.data?.items?.reduce((quantity, item) => quantity + item.quantity, 0) || 0;
                        console.log(`totalQuantity`,totalQuantity)    
                        items.itemsCount = totalQuantity || 0;
                        items.totalAmount = orderDetails?.data?.totalAmount || 0;
                        console.log(`items`,items)        
                    } catch (error) {
                        console.log(`orderDetails`,error)    
                    }                    
                    return items;
                } catch (error) {
                    console.log(`Error fetching details for order ${items.orderId}:`, error);
                    return items; // Возвращаем заказ без обновленных данных
                }
            })
        );
        // Убрали все заказы с 0 количеством товаров (сбойные)
        const filteredUsers = updatedOrders.filter(order => order.totalAmount !== 0);
        // Отправляем ответ
        sendResponse(res, 200, { 
            status: true, 
            orders: filteredUsers.map(order => new OrderDto(order)) 
        });
    } catch (error) {
        console.error("Error in getOrders:", error);
        const statusCode = Number.isInteger(error) ? error : 500;
        sendResponse(res, statusCode, { 
            code: statusCode, 
            message: new CommonFunctionHelper().getDescriptionByCode(statusCode) 
        });
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

exports.getOrderByReferenceId = async (req, res) => {    
    let userId = await authMiddleware.getUserId(req, res);
    let referenceId = req.params.referenceId;
    if (!userId) {  console.log("Invalid user ID");  throw(400); }
    if (!referenceId) {  console.log("Invalid referenceId" ); throw(400); }
    try {
        let order = await orderHelper.getOrderByReferenceId(referenceId, userId);
        if (!order) return sendResponse(res, 204, { status: false, order : {} });        
        sendResponse(res, 200, { status: true,  order : new OrderDto(order), });
    } catch (error) {
        console.error("Error getOrder:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};


/*
{
"referenceId" : "ea20e4f6-30d6-4ce1-a494-be371a5be672"	,
"status" : "ENABLED",
"type" : "PROFESSIONAL"	
}
*/


 async function createSubscription(userId, status, level, referenceId) {    
   try {
     if(!userId || !level || !referenceId) 
        throw(422)
        let _subscription = await orderHelper.getSubscriptionStatus(userId); // получить состояние подписки       
        if(_subscription) throw(409)
        let order = await orderHelper.create(userId, referenceId); // создать подписку
        if(!order?.order_id) 
            throw(422);
        let subscription = await orderHelper.subscription(userId, status, order?.order_id, level); // создать заказ
        return subscription;      
     } catch (error) {
        console.log(`createSubscription `, error)
    throw(error)
  }
}    

async function deleteSubscription(userId, status) {    
  try {
       let subscription = await orderHelper.subscription(userId, status); // удалить подписку
        if(!subscription) 
            throw(422);        
     } catch (error) {
        console.log(`createSubscription `, error)
     throw(error)    
  }
}    

exports.subscription = async (req, res) => {    
    try {
        let userId = await authMiddleware.getUserId(req, res);
        if (!userId) throw(401);
        
        let {subscriptionId, referenceId, status, level} = req.body;    
        if (!referenceId) throw(400);                 
        
        switch(status){
          case orderHelper.SUBSCRIPTION_ACTION.CREATE : { // создать  подписку
            let subscription = await createSubscription( userId, status, level, referenceId);
            if(!subscription) throw(409)
            sendResponse(res, 200, { status: true,  subscription });
            return;
          }

          case orderHelper.SUBSCRIPTION_ACTION.DELETE : { // удалить подписку
            let subscription = await deleteSubscription(subscriptionId, userId, status );
            if(!subscription) throw(409)
            sendResponse(res, 200, { status: true,  subscription });
            return;
          }
          default: 
           throw(422)
        }
    } catch (error) {
        console.error("Error subscription:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};



exports.getSubscriptionStatus = async (req, res) => {    
    try {
        let userId = await authMiddleware.getUserId(req, res);
        if (!userId) throw(401);

        let subscription = await orderHelper.getSubscriptionStatus(userId); // получить состояние подписки        
        sendResponse(res, 200, { status: true,  subscription });
    } catch (error) {
        console.error("Error subscription:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};


exports.getSubscriptions = async (req, res) => {    
    try {
        let userId = await authMiddleware.getUserId(req, res);
        if (!userId) throw(401);

        let subscriptions = await orderHelper.getSubscriptions(userId); // получить состояние подписки        
        sendResponse(res, 200, { status: true,  subscriptions });
    } catch (error) {
        console.error("Error subscription:", error);
        sendResponse(res, (Number(error) || 500), { code: (Number(error) || 500), message:  new CommonFunctionHelper().getDescriptionByCode((Number(error) || 500)) });
    }
};
