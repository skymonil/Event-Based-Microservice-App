const { Kafka } = require('kafkajs');
const config = require('./config');

class KafkaTestClient {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: { retries: 5 } // Aggressive connect retries for CI
    });
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: config.kafka.groupId });
    this.messages = []; // In-memory buffer for assertions
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return;
    await this.producer.connect();
    await this.consumer.connect();
    this.isConnected = true;
  }

  async disconnect() {
    if (!this.isConnected) return;
    await this.producer.disconnect();
    await this.consumer.disconnect();
    this.isConnected = false;
  }

  /**
   * Publish an event to Kafka
   */
  async produce(topic, key, message) {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(message) }]
    });
  }

  /**
   * Start listening to topics and buffer messages
   */
  async subscribe(topics) {
    await this.consumer.subscribe({ topics, fromBeginning: false });
    
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const payload = JSON.parse(message.value.toString());
        this.messages.push({ topic, payload });
      }
    });
  }

  /**
   * Helper: Check if a message matching the predicate exists in buffer
   */
  findMessage(topic, predicate) {
    return this.messages.find(m => m.topic === topic && predicate(m.payload));
  }
}

// Export singleton
module.exports = new KafkaTestClient();