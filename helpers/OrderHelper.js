const db = require('openfsm-database-connection-producer');
const { UserPermissionsDTO, RoleDTO, PermissionDTO } = require('openfsm-permissions-dto');
const { UserDTO } = require('openfsm-user-dto');
const common      = require('openfsm-common');  /* Библиотека с общими параметрами */
const {OrderDto}   = require('openfsm-order-dto');

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
    db.query(`SELECT order_id, status, created_at, updated_at from orders where 1=1 and order_id=? and user_id=?`, [orderId, userId],
      (err, results) => {
        if (err) {
          return reject(err);
        } else
        resolve(results[0]);                
      }
    );
  });
};


