const mysql = require('mysql2');
require('dotenv').config();


const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const connectWithRetry = ( retries = 5, delay = 2000) => {
  return new Promise((resolve, reject) => {
    console.log( process.env.DB_HOST, process.env.DB_USER, process.env.DB_NAME );
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Failed to connect to MySQL database:', err);
        if (retries > 0) {
          console.log(`Retrying to connect in ${delay}ms... (${retries} retries left)`);
          setTimeout(() => {
            connectWithRetry(  retries - 1, delay).then(resolve).catch(reject);
          }, delay);
        } else {
          throw('All retries to connect to MySQL database failed');
          reject('All retries to connect to MySQL database failed');
        }
      } else {
        console.log('Connected to MySQL database SUCCESS');
        connection.release();
        resolve();
      }
    });
  });
};

// Инициализируем подключение с переподключением
connectWithRetry()
  .then(() => console.log('Database connection established'))
  .catch(error => console.error(error));

module.exports = pool
