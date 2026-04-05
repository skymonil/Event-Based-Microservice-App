const SERVICE_NAME =
 process.env.OTEL_SERVICE_NAME;

module.exports =
 (metrics) =>
 (req, res, next) => {

  const start =
   process.hrtime.bigint();

  res.on("finish", () => {

   const duration =
    Number(
     process.hrtime.bigint()
     - start
    ) / 1e9;

   let route = "unmatched";

   if (req.route?.path) {

    route =
     (req.baseUrl || "")
     + req.route.path;

   }

   const isInternal =

    route === "/health"
    || route === "/metrics";

   if (!isInternal) {

    const labels = {

     method:
      req.method,

     route,

     status:
      res.statusCode,

     service:
      SERVICE_NAME,

    };

    metrics
     .httpRequestsTotal
     .inc(labels);

    metrics
     .httpRequestDuration
     .observe(
      labels,
      duration
     );

   }

  });

  next();

 };