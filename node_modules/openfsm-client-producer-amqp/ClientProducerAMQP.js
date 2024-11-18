'use strict'
const amqp = require('amqplib');
const logger = console; // Подключите ваш логгер здесь

class ClientProducerAMQP {
  constructor(process_name, login, pwd) {
    const { RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_QUEUE } = process.env;
    
    this.process_name = process_name;
    this.login = login || RABBITMQ_USER || 'guest';
    this.pwd = pwd || RABBITMQ_PASSWORD || 'guest';
    this.queue = RABBITMQ_QUEUE || 'mail';
    this.host = RABBITMQ_HOST || 'localhost';
    this.port = RABBITMQ_PORT || '5672';

    this.connection = null;
    this.channel = null;
    this.sync = false;
    this.correlationId = null;
  }

  // Метод для создания соединения
  async createConnection() {
    try {
      this.connection = await amqp.connect(`amqp://${this.login}:${this.pwd}@${this.host}:${this.port}`);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
    } catch (err) {
      console.log('Error creating AMQP connection:', err);
      throw err;
    }
  }

  // Метод для закрытия соединения
  async closeConnection() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      console.log('Error closing AMQP connection:', err);
      throw err;
    }
  }

  // Абстрактный метод отправки уведомления, который нужно переопределить в дочернем классе
  async sendNotification(payload) {
    throw new Error('sendNotification method must be implemented in subclass');
  }

  // Метод отправки сообщения в очередь
  async sendMessage(queue, msg) {
    try {
      if (!this.channel) await this.createConnection();
      const options = this.sync ? { expiration: '60000' } : null;
      await this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), options);
      console.log(`Message sent to queue "${queue}"`);
    } catch (err) {
      console.log('Error sending message:', err);
      throw err;
    } finally {
      await this.closeConnection();
    }
  }
};

module.exports = ClientProducerAMQP;