-- migrate:up
ALTER TABLE outbox
ADD COLUMN traceparent TEXT,
ADD COLUMN tracestate TEXT;


-- migrate:down

ALTER TABLE outbox
DROP COLUMN IF EXISTS traceparent,
DROP COLUMN IF EXISTS tracestate;