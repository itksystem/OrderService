const db = require('openfsm-database-connection-producer');
const { UserPermissionsDTO, RoleDTO, PermissionDTO } = require('openfsm-permissions-dto');
const { UserDTO } = require('openfsm-user-dto');
const common = require('openfsm-common'); // Библиотека с общими параметрами
const { OrderDto } = require('openfsm-order-dto');
require('dotenv').config({ path: '.env-order-service' });
const ClientProducerAMQP = require('openfsm-client-producer-amqp'); // ходим в почту через шину
const { AbortController } = require('abort-controller');
const amqp = require('amqplib');
const SQL        = require('common-orders-service').SQL;
const MESSAGES        = require('common-orders-service').MESSAGES;
const logger          = require('openfsm-logger-handler');
const { query } = require('winston');
const LANGUAGE = 'RU';

exports.SUBSCRIPTION_ACTION = {  
  CREATE  : 'CREATE',  // создать подписку
  DELETE  : 'DELETE', // удалить подписку  
  ACTIVATED  : 'ACTIVATED', // включить подписку через шину 
  DEACTIVATED  : 'DEACTIVATED', // отключить подписку через шину
}


/* Коннектор для шины RabbitMQ */
const {
  RABBITMQ_HOST,
  RABBITMQ_PORT,
  RABBITMQ_USER,
  RABBITMQ_PASSWORD,
  RABBITMQ_ORDER_STATUS_QUEUE,
  RABBITMQ_DELIVERY_ORDER_ACTION_QUEUE,
  RABBITMQ_SUBSCRIPTION_ACTION_QUEUE
} = process.env;

const login = RABBITMQ_USER || 'guest';
const pwd = RABBITMQ_PASSWORD || 'guest';
const ORDER_STATUS_QUEUE = RABBITMQ_ORDER_STATUS_QUEUE || 'ORDER_STATUS';
const SUBSCRIPTION_ACTION_QUEUE = RABBITMQ_SUBSCRIPTION_ACTION_QUEUE || 'SUBSCRIPTION_ACTION';
const DELIVERY_ORDER_ACTION_QUEUE = RABBITMQ_DELIVERY_ORDER_ACTION_QUEUE || DELIVERY_ORDER_ACTION_QUEUE;
const host = RABBITMQ_HOST || 'rabbitmq-service';
const port = RABBITMQ_PORT || '5672';

exports.QUEUE = {
    SUBSCRIPTION_ACTION_QUEUE: "SUBSCRIPTION_ACTION_QUEUE",
    DELIVERY_ORDER_ACTION_QUEUE : "DELIVERY_ORDER_ACTION_QUEUE"
};

// Создание заказа
exports.create = (userId, referenceId) => {
  return new Promise((resolve, reject) => {
    // Первый запрос: вставка данных
    db.query(
      SQL.ORDER.CREATE,      
      [userId, referenceId],
      (err, results) => {
        if (err) {
          logger.error(err)
          return reject(err);
        }        
        resolve(results?.rows[0] ?? null);
      }
    );
  });
};

// Отмена заказа
exports.decline = (orderId = null, userId = null) => {
  console.log(`decline ${orderId} ${orderId}`);
  if(!orderId || !userId) return false;
  let status = common.OrderStatus.DECLINE;
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.UPDATE_STATUS,
      [status, orderId, userId],
      (err) => {
        if (err) {
          logger.error(err)
          return reject(false);
        } else {
          resolve(true);
        }
      }
    );
  });
};


// Получение списка заказов пользователя
exports.getOrders = (userId = null, status = null) => {
  if(!userId) return [];
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.FIND_BY_USER,
      [userId, status],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {          
          try {
            // Проверяем наличие результатов и что это массив
            if (!results?.rows || !Array.isArray(results.rows)) {
              return resolve([]);
            }
            
            // Преобразуем все записи в DTO
            const orders = results.rows.map((order) => {
              let o = new OrderDto(order);
              return o;
            }) 
            console.log(orders)
            resolve(orders);
          } catch (e) {
            // Обрабатываем возможные ошибки при создании DTO
            reject(new Error('Failed to process orders data'));
          }
        }
      }
    );
  });  
};

// Получение заказа по ID заказа и ID пользователя
exports.getOrder = (orderId, userId) => {
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.FIND_BY_ORDER_AND_USER,
      [orderId, userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {
          resolve(results?.rows[0] ?? null);
        }
      }
    );
  });
};

// Получение заказа по reference ID и ID пользователя
exports.getOrderByReferenceId = (referenceId, userId) => {
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.FIND_BY_REFERENCE_AND_USER,
      [referenceId, userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {
          resolve(results?.rows[0] ?? null);
        }
      }
    );
  });
};


// подписка - включить / выключить
exports.subscription = (userId, status, orderId, level) => {  
  switch(status) {    
    case exports.SUBSCRIPTION_ACTION.CREATE :  {       
      return new Promise((resolve, reject) => {
        db.query(
          SQL.ORDER.SUBSCRIPTION_CREATE,  [userId, orderId, level],
          (err, results) => {
            if (err) {
              return reject(err);
            } else {
              resolve(results?.rows[0] ?? null);
            }
          }
        );
      });      
    }
    case exports.SUBSCRIPTION_ACTION.DELETE :  {       
      return new Promise((resolve, reject) => {
        db.query(
          SQL.ORDER.SUBSCRIPTION_DELETE,  [userId],
          (err, results) => {
            if (err) {
              return reject(err);
            } else {
              resolve(results?.rows[0] ?? null);
            }
          }
        );
      });      
    }
    default : 
      return null;
  } 
};

// подписка - включить / выключить через шину
exports.updateSubscription = (msg) => {
  return new Promise((resolve, reject) => {
    const {userId, orderId, level, status} = msg;
    db.query(
      SQL.ORDER.SUBSCRIPTION_UPDATE,  [userId, orderId, level],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {
          resolve(results?.rows[0] ?? null);
        }
      }
    );
  });
};

// статус подписки
exports.getSubscriptionStatus = (userId ) => {  
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.SUBSCRIPTION_STATUS,  [userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {
          resolve(results?.rows[0] ?? null);
        }
      }
    );
  });
};

// статус подписки
exports.getSubscriptions = (userId ) => {  
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.SUBSCRIPTIONS,  [],
      (err, results) => {
        if (err) {
          return reject(err);
        } else {
          resolve(results?.rows ?? null);
        }
      }
    );
  });
};


// Установка статуса заказа
exports.orderStatusMessage = async (statusMessage) => {
  try {
    let rabbitClient = new ClientProducerAMQP();
    await rabbitClient.sendMessage(ORDER_STATUS_QUEUE, statusMessage);
    console.log(`orderStatusMessage => `, statusMessage);
  } catch (error) {
    console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  }
  return;
};


// ****************************************  Подключение к RabbitMQ и прослушивание очереди  *************************************************

// отправить сообщение в шину 
exports.sendMessage = async (queue = null, msg = null) => {
  try {
    if(!queue && !msg) return;
    let client = new ClientProducerAMQP();
    await client.sendMessage(queue, msg);    
  } catch (error) {
    console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  }  
};


async function startConsumer(queue, handler) {
  try {
     const connection = await amqp.connect(`amqp://${login}:${pwd}@${host}:${port}`);
     const channel = await connection.createChannel();
     await channel.assertQueue(queue, { durable: true });
     console.log(`Listening on queue ${queue}...`);
     channel.consume(queue, async (msg) => {
        if (msg) {
           try {
              const data = JSON.parse(msg.content.toString());
              await handler(data);
              channel.ack(msg);
           } catch (error) {
               console.error(`Error processing message: ${error}`);
               channel.ack(msg);
            }
          }
        });
      } catch (error) {
          
          console.error(`Error connecting to RabbitMQ: ${error}`);
   }
}

