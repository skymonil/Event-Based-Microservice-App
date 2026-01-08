const kafka = require('./kafka');

const producer = kafka.producer();

let connected = false;

const sendToDLQ = async ({ topic, message, error }) => {
  if (!connected) {
    await producer.connect();
    connected = true;
  }

  await producer.send({
    topic: `${topic}.dlq`,
    messages: [
      {
        key: message.key,
        value: message.value,
        headers: {
          "x-error": Buffer.from(error.message || "unknown"),
          "x-failed-at": Buffer.from(new Date().toISOString())
        }
      }
    ]
  });
};

module.exports = { sendToDLQ };
