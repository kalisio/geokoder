const path = require('path')
const winston = require('winston')

const host = process.env.HOSTNAME || 'localhost'
const port = process.env.PORT || 8080
const apiPath = process.env.API_PREFIX || '/api'
const baseUrl = process.env.BASE_URL || `http://${host}:${port}`

module.exports = {
  host,
  port,
  baseUrl,
  apiPath,
  providers: {
    // Kano: {},
    // NodeGeocoder: {
    //   // Each key is a geocoder to instanciate in node-geocoder
    //   // if value is false-ish, it won't be instanciated
    //   opendatafrance: true,
    //   openstreetmap: true
    // },
    // MBTiles: {
    //   // For performance reason each layer in a dataset should have the same max zoom level, if not two different providers should be created for now
    //   // Create a local.cjs file with your own data to test it as we don't provide any default datasets
    //   // Each key will be a new source using the provided file
    //   'admin-express': { filepath: path.join(__dirname, '../data/mbtiles/admin-express.mbtiles'), layers: ['commune', 'departement'] }
    // }
  },
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
    // Use only Kano services
    remoteServices: (service) => (service.key === 'kano'),
    healthcheckPath: apiPath + '/distribution/'
  }
}
