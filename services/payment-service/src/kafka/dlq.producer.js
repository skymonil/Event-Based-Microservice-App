// services/payment-service/src/kafka/dlq.producer.js
const kafka = require('./kafka')
const {Partitioners} = require('kafkajs')
const producer = kafka.producer({
  allowAutoTopicCreation: true,
  idempotent: true,          // 👈 VERY important
  maxInFlightRequests: 5,
  transactionTimeout: 30000,
createPartitioner: Partitioners.DefaultPartitioner}
);

const sendToDLQ = async ({ topic, message, error }) => {
    await producer.connect();

    await producer.send({
        topic: `${topic}.dlq`,
        messages: [
            {
                key: message.key,
                value: message.value,
                headers: {
                    "x-error": Buffer.from(error.message),
                    "x-failed-at": Buffer.from(new Date().toISOString())
                }
            }
        ]
    })
     await producer.disconnect();
}
module.exports = { sendToDLQ };