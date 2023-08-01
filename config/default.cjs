const path = require('path')
const winston = require('winston')

const host = process.env.HOSTNAME || 'localhost'
const port = process.env.PORT || 8091
const apiPath = process.env.API_PREFIX || '/api'
const baseUrl = process.env.BASE_URL || `http://${host}:${port}`

module.exports = {
  host,
  port,
  baseUrl,
  apiPath,
  NodeGeocoder: [
    { provider: 'opendatafrance' },
    { provider: 'openstreetmap', headers: { 'user-agent': 'geokoder/0.1.0', referrer: '/forward' } }
  ],
  renames: [
    { from: 'kano:rte-units', to: 'rte' },
    { from: 'kano:hubeau-hydro-stations', to: 'hubeau:hydro' },
    { from: 'opendatafrance', to: 'ban' },
    { from: 'openstreetmap', to: 'nominatim' },
  ],
  logs: {
    Console: {
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      level: (process.env.NODE_ENV === 'development' ? 'verbose' : 'info')
    },
    DailyRotateFile: {
      format: winston.format.json(),
      dirname: path.join(__dirname, '..', 'logs'),
      filename: 'geokoder-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d'
    }
  },
  distribution: { // Distribute no services simply use remote ones from Kano
    services: (service) => false,
    remoteServices: (service) => (service.key === 'kano'),
    healthcheckPath: apiPath + '/distribution/'
  }
}
