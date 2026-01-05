const kafka = require('./kafka')

const producer = kafka.producer()

const sendToDLQ = async({topic, message, error})=>{
    await producer.connect()

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

module.exports = { sendToDLQ }