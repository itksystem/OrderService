const db = require('openfsm-database-connection-producer');
const { UserPermissionsDTO, RoleDTO, PermissionDTO } = require('openfsm-permissions-dto');
const { UserDTO } = require('openfsm-user-dto');
const common      = require('openfsm-common');  /* Библиотека с общими параметрами */
const {OrderDto}   = require('openfsm-order-dto');
require('dotenv').config({ path: '.env-order-service' });
const ClientProducerAMQP  =  require('openfsm-client-producer-amqp'); // ходим в почту через шину
const amqp = require('amqplib');

/* Коннектор для шины RabbitMQ */
const { RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD,  
  RABBITMQ_ORDER_STATUS_QUEUE, RABBITMQ_WAREHOUSE_DECLINE_QUEUE, RABBITMQ_DELIVERY_DECLINE_QUEUE, RABBITMQ_ORDER_DECLINE_QUEUE  } = process.env;
const login = RABBITMQ_USER || 'guest';
const pwd = RABBITMQ_PASSWORD || 'guest';
const ORDER_STATUS_QUEUE       = RABBITMQ_ORDER_STATUS_QUEUE || 'ORDER_STATUS';
const ORDER_DECLINE_QUEUE      = RABBITMQ_ORDER_DECLINE_QUEUE || 'ORDER_DECLINE';
const WAREHOUSE_DECLINE_QUEUE  = RABBITMQ_WAREHOUSE_DECLINE_QUEUE || 'WAREHOUSE_DECLINE';
const DELIVERY_DECLINE_QUEUE   = RABBITMQ_DELIVERY_DECLINE_QUEUE || 'DELIVERY_DECLINE';
const host = RABBITMQ_HOST || 'rabbitmq-service';
const port = RABBITMQ_PORT || '5672';



exports.create = (userId, referenceId) => {
  return new Promise((resolve, reject) => {  
    // Первый запрос: вставка данных
    db.query(
      `INSERT INTO orders (user_id, reference_id) VALUES (?, ?)`,
      [userId, referenceId],
      (err) => {
        if (err) {
          return reject(null);
        }
        // Второй запрос: получение данных - провереряем что заказ создался и получаем RecordSet
        db.query(
          `SELECT * FROM orders WHERE user_id = ? AND reference_id = ?`,
          [userId, referenceId],
          (err, results) => {
            if (err) {
              return reject(null);
            }
            // Если запись найдена, возвращаем её
            resolve(results[0]);
          }
        );
      }
    );
  });
};


exports.decline = (orderId, userId) => {
  let status = common.OrderStatus.CANCELED; 
  return new Promise((resolve, reject) => {  
    // Первый запрос: вставка данных    
    db.query(`UPDATE orders SET status = ?  where 1=1 and order_id=? and user_id=?`, 
      [status, orderId, userId],
      (err) => {
        if (err) {
          return reject(false);
        } else
        resolve(true);                
      }
    );
  });
};


exports.getOrders = (userId) => {
  return new Promise((resolve, reject) => {      
    db.query(`SELECT order_id, status, created_at, updated_at from orders where 1=1 and user_id=?`, [userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else
        resolve(results);                
      }
    );
  });
};


exports.getOrder = (orderId, userId) => {
  return new Promise((resolve, reject) => {      
    db.query(`SELECT order_id, reference_id, status, created_at, updated_at from orders where 1=1 and order_id=? and user_id=?`, [orderId, userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else
        resolve(results[0]);                
      }
    );
  });
};


exports.getOrderByReferenceId = (referenceId, userId) => {
  return new Promise((resolve, reject) => {      
    db.query(`SELECT order_id, status, created_at, updated_at from orders where 1=1 and reference_id=? and user_id=?`, [referenceId, userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else
        resolve(results[0]);                
      }
    );
  });
};



  
 //  Установить статус заказа
exports.orderStatusMessage = async (statusMessage) => {
  try {
     let rabbitClient = new ClientProducerAMQP();
      await  rabbitClient.sendMessage(ORDER_STATUS_QUEUE, statusMessage )  
    } catch (error) {
      console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  } 
  return;
}

async function WarehouseOrderDeclineMessage(statusMessage){ // отменить биронирование товара на складе
  try {
     let rabbitClient = new ClientProducerAMQP();
      await  rabbitClient.sendMessage(WAREHOUSE_DECLINE_QUEUE, statusMessage )  
    } catch (error) {
      console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  } 
  return;
}

async function DeliveryOrderReservationDeclineMessage (statusMessage){ // отменить бронирование доставки
  try {
     let rabbitClient = new ClientProducerAMQP();
      await  rabbitClient.sendMessage(DELIVERY_DECLINE_QUEUE, statusMessage )  
    } catch (error) {
      console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  } 
  return;
}

async function ReturnTransactionExecuteMessage (statusMessage){ // выполнить операцию возврата средств
/*  try {
     let rabbitClient = new ClientProducerAMQP();
      await  rabbitClient.sendMessage(DELIVERY_DECLINE_QUEUE, statusMessage )  
    } catch (error) {
      console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  } 
*/
  console.log('ReturnTransactionExecuteMessage пока не реализован!!!');       
  return;
}




// Подключение к RabbitMQ и прослушивание очереди
async function startConsumer(queue){
  try {        
      const connection = await amqp.connect(`amqp://${login}:${pwd}@${host}:${port}`);
      const channel = await connection.createChannel();
      await channel.assertQueue(queue, { durable: true });
      console.log(`Ожидание сообщений в очереди ${queue}...`);

      channel.consume(queue, async (msg) => {
          if (msg !== null) {
              console.log(JSON.parse(msg.content.toString()));
              await startOrderStatusProducer(JSON.parse(msg.content.toString()));
              channel.ack(msg); // Подтверждение обработки сообщения
          }
      });
    } catch (error) {
      console.error(`Ошибка подключения к RabbitMQ: ${error}`);
  }
}

async function setOrderStatus(status, orderId){
  console.log(`Установка статуса ${status} заказу ${orderId}`);
  return new Promise((resolve, reject) => {      
    db.query(`update orders
       set 
        status = ?
       where 1=1
        and order_id=? 
        `, [status, orderId],
      (err) => {
        if (err) {
          return reject(err);
        } else
        resolve(true);                
      }
    );
  });
};


async function startOrderStatusProducer(msg){
  try {        
      console.log(`Поступило сообщение ${JSON.stringify(msg)}`);
      if(!msg) return;
       await setOrderStatus(msg.processStatus, msg.order.orderId);    //установить статус       
    } catch (error) {
      console.error(`Ошибка : ${error}`);
  }
}

// Подключение к RabbitMQ и прослушивание очереди ORDER_ROLLBACK_QUEUE
async function startRollbackConsumer(queue){
  try {        
      const connection = await amqp.connect(`amqp://${login}:${pwd}@${host}:${port}`);
      const channel = await connection.createChannel();
      await channel.assertQueue(queue, { durable: true });
      console.log(`Ожидание сообщений в очереди ${queue}...`);
      channel.consume(queue, async (msg) => {
          if (msg !== null) {
              _msg = JSON.parse(msg.content.toString());
              console.log(_msg);
              _msg.processStatus = 'DECLINE';
              await startOrderStatusProducer(_msg); // установить статус ОТКЛОНЕН
              await orderRollbackProducer(_msg);    // произвести откат операций
              channel.ack(msg); // Подтверждение обработки сообщения
          }
      });
    } catch (error) {
      console.error(`Ошибка подключения к RabbitMQ: ${error}`);
  }
}


// Продьюсер отката операций 
async function orderRollbackProducer(msg){
  try {        
      console.log(`Поступило сообщение ${JSON.stringify(msg)}`);
      if(!msg) return;      
      if(msg?.status === false){       // откат транзакции
          await WarehouseOrderDeclineMessage(msg);
          await DeliveryOrderReservationDeclineMessage(msg);
          await ReturnTransactionExecuteMessage(msg);
       }
      } catch (error) {
      console.error(`Ошибка : ${error}`);
  }
}



startConsumer(ORDER_STATUS_QUEUE); /* Запуск консьюмера ORDER_STATUS_QUEUE*/
startRollbackConsumer(ORDER_DECLINE_QUEUE); /* Запуск консьюмера ORDER_DECLINE_QUEUE*/

