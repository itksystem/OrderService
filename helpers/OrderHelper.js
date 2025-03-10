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
const LANGUAGE = 'RU';



/* Коннектор для шины RabbitMQ */
const {
  RABBITMQ_HOST,
  RABBITMQ_PORT,
  RABBITMQ_USER,
  RABBITMQ_PASSWORD,
  RABBITMQ_ORDER_STATUS_QUEUE,
  RABBITMQ_WAREHOUSE_DECLINE_QUEUE,
  RABBITMQ_DELIVERY_DECLINE_QUEUE,
  RABBITMQ_ORDER_DECLINE_QUEUE,
} = process.env;

const login = RABBITMQ_USER || 'guest';
const pwd = RABBITMQ_PASSWORD || 'guest';
const ORDER_STATUS_QUEUE = RABBITMQ_ORDER_STATUS_QUEUE || 'ORDER_STATUS';
const ORDER_DECLINE_QUEUE = RABBITMQ_ORDER_DECLINE_QUEUE || 'ORDER_DECLINE';
const WAREHOUSE_DECLINE_QUEUE = RABBITMQ_WAREHOUSE_DECLINE_QUEUE || 'WAREHOUSE_DECLINE';
const DELIVERY_DECLINE_QUEUE = RABBITMQ_DELIVERY_DECLINE_QUEUE || 'DELIVERY_DECLINE';
const host = RABBITMQ_HOST || 'rabbitmq-service';
const port = RABBITMQ_PORT || '5672';

// Создание заказа
exports.create = (userId, referenceId) => {
  return new Promise((resolve, reject) => {
    // Первый запрос: вставка данных
    db.query(
      SQL.ORDER.CREATE,      
      [userId, referenceId],
      (err) => {
        if (err) {
          logger.error(err)
          return reject(null);
        }        
        // Второй запрос: проверка, что заказ создался, и получение RecordSet
        db.query(
          SQL.ORDER.FIND_BY_USER_AND_REFERENCE,
          [userId, referenceId],
          (err, results) => {
            if (err) {
              logger.error(err)
              return reject(null);
            }
            // Если запись найдена, возвращаем её
            resolve(results?.rows[0] ?? null);
          }
        );
      }
    );
  });
};

// Отмена заказа
exports.decline = (orderId = null, userId = null) => {
  console.log(`decline ${orderId} ${orderId}`);
  if(!orderId || !userId) return false;
  let status = common.OrderStatus.CANCELED;
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
exports.getOrders = (userId) => {
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.FIND_BY_USER,
      [userId],
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

// Отмена бронирования товара на складе
async function WarehouseOrderDeclineMessage(statusMessage) {
  try {
    let rabbitClient = new ClientProducerAMQP();
    await rabbitClient.sendMessage(WAREHOUSE_DECLINE_QUEUE, statusMessage);
  } catch (error) {
    console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  }
  return;
}

// Отмена бронирования доставки
async function DeliveryOrderReservationDeclineMessage(statusMessage) {
  try {
    let rabbitClient = new ClientProducerAMQP();
    await rabbitClient.sendMessage(DELIVERY_DECLINE_QUEUE, statusMessage);
  } catch (error) {
    console.log(`Ошибка ${error} при отправке статуса заказа ...`);
  }
  return;
}

// Выполнение операции возврата средств
async function ReturnTransactionExecuteMessage(statusMessage) {
  console.log('ReturnTransactionExecuteMessage пока не реализован!!!');
  return;
}

// Подключение к RabbitMQ и прослушивание очереди
async function startConsumer(queue) {
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

// Установка статуса заказа
async function setOrderStatus(status, orderId) {
  console.log(`Установка статуса ${status} заказу ${orderId}`);
  return new Promise((resolve, reject) => {
    db.query(
      SQL.ORDER.UPDATE_STATUS_BY_ORDER,
      [status, orderId],
      (err) => {
        if (err) {
          return reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}

// Обработка сообщения о статусе заказа
async function startOrderStatusProducer(msg) {
  try {
    console.log(`Поступило сообщение ${JSON.stringify(msg)}`);
    if (!msg) return;
    await setOrderStatus(msg.processStatus, msg.order.orderId); // Установить статус
  } catch (error) {
    console.error(`Ошибка: ${error}`);
  }
}

// Подключение к RabbitMQ и прослушивание очереди ORDER_ROLLBACK_QUEUE
async function startRollbackConsumer(queue) {
  try {
    const connection = await amqp.connect(`amqp://${login}:${pwd}@${host}:${port}`);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });
    console.log(`Ожидание сообщений в очереди ${queue}...`);

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        const _msg = JSON.parse(msg.content.toString());
        console.log(_msg);
        _msg.processStatus = 'DECLINE';
        await startOrderStatusProducer(_msg); // Установить статус ОТКЛОНЕН
        await orderRollbackProducer(_msg); // Произвести откат операций
        channel.ack(msg); // Подтверждение обработки сообщения
      }
    });
  } catch (error) {
    console.error(`Ошибка подключения к RabbitMQ: ${error}`);
  }
}

// Продьюсер отката операций
async function orderRollbackProducer(msg) {
  try {
    console.log(`Поступило сообщение ${JSON.stringify(msg)}`);
    if (!msg) return;
    if (msg?.status === false) {
      // Откат транзакции
      await WarehouseOrderDeclineMessage(msg);
      await DeliveryOrderReservationDeclineMessage(msg);
      await ReturnTransactionExecuteMessage(msg);
    }
  } catch (error) {
    console.error(`Ошибка: ${error}`);
  }
}

// Запуск консьюмеров
startConsumer(ORDER_STATUS_QUEUE); // Запуск консьюмера ORDER_STATUS_QUEUE
startRollbackConsumer(ORDER_DECLINE_QUEUE); // Запуск консьюмера ORDER_DECLINE_QUEUE