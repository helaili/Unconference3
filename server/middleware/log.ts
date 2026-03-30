const requestLog = useLogger('request')

export default defineEventHandler((event) => {
  const start = Date.now()
  const method = event.method
  const path = getRequestURL(event).pathname

  event.node.res.on('finish', () => {
    const duration = Date.now() - start
    const status = event.node.res.statusCode
    const msg = `${method} ${path} → ${status} (${duration}ms)`

    if (status >= 500) {
      requestLog.error(msg)
    } else if (status >= 400) {
      requestLog.warn(msg)
    } else {
      requestLog.debug(msg)
    }
  })
})
