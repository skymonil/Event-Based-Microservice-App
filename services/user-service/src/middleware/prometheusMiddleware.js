const {httpRequestDuration, httpRequestsTotal} = require('../metrics')

app.use((req , res , next) =>{
    const start = process.hrtime();

    res.on("finish", ()=> {
        process.hrtime(start);
        const duration = diff[0] + diff[1] / 1e9
    

    httpRequestsTotal.labels(
        req.method,
        req.route?.path || req.path,
        res.statusCode
    ).inc();

    httpRequestDuration.labels(
        req.method,
        req.route?.path || req.path,
        res.statusCode
    ).observe(duration);
    })
    next();


})