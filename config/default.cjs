const _ = require('lodash')
const path = require('path')
const glob = require('glob')
const winston = require('winston')
const express = require('@feathersjs/express')
const commonHooks = require('feathers-hooks-common')

const host = process.env.HOSTNAME || 'localhost'
const port = process.env.PORT || 8080
const apiPath = process.env.API_PREFIX || '/api'
const baseUrl = process.env.BASE_URL || `http://${host}:${port}`

let i18n = {}
glob.sync(path.join(__dirname, 'i18n/**/*.cjs')).forEach(i18nFile => {
  _.merge(i18n, require(i18nFile))
})

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
  i18n,
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
    // We don't care about events
    distributedEvents: [],
    // https://github.com/kalisio/feathers-distributed#remote-services
    // We don't want to expose distributed services by Kano, simply consume it internally
    //middlewares: { after: express.errorHandler() },
    hooks: {
      before: { all: [commonHooks.disallow('external')] }
    },
    healthcheckPath: apiPath + '/distribution/'
  }
}
