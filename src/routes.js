import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import errors from '@feathersjs/errors'
import makeDebug from 'debug'
import { scoreResult } from './scoring.js'
import { Providers } from './providers.js'

const debug = makeDebug('geokoder:routes')

// provider
//  => liste de sources
//  => forward, reverse
//
// kano feature services = provider
//  => sources = rte-units, hubeau-stations ...

export default function (app) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const packageInfo = fs.readJsonSync(path.join(__dirname, '..', 'package.json'))

  app.get('/healthcheck', (req, res, next) => {
    const response = {
      name: 'geokoder',
      // Allow to override version number for custom build
      version: (process.env.VERSION ? process.env.VERSION : packageInfo.version)
    }
    if (process.env.BUILD_NUMBER) {
      response.buildNumber = process.env.BUILD_NUMBER
    }
    res.json(response)
  })

  app.get('/capabilities/:operation', async (req, res, next) => {
    const operation = _.get(req, 'params.operation')
    
    const all = Providers.get().filter(provider => typeof provider[operation] === 'function').map(provider => provider.capabilities())

    const response = {
      geocoders: [],
      i18n: app.get('i18n')['i18n']
    }
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        app.logger.error(result.reason.toString())
        return
      }

      response.geocoders.splice(-1, 0, ...result.value)
    })

    res.json(response)
  })

  app.get('/forward', async (req, res, next) => {
    const q = _.get(req.query, 'q')
    const filter = _.get(req.query, 'sources', '*')
    const all = Providers.get().filter(provider => typeof provider.forward === 'function').map(provider => provider.forward(q, filter))

    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        app.logger.error(result.reason.toString())
        return
      }

      result.value.forEach((entry) => {
        const normalized = entry.feature
        normalized.geokoder = {
          source: entry.source,
          match: entry.match,
          matchProp: entry.matchProp,
          score: scoreResult(q.toUpperCase(), entry.match.toUpperCase())
        }
        response.push(normalized)
      })
    })

    // sort by score
    response.sort((a, b) => {
      return a.geokoder.score < b.geokoder.score
        ? 1
        : a.geokoder.score > b.geokoder.score
          ? -1
          : 0
    })

    res.json(response)
  })

  app.get('/reverse', async (req, res, next) => {
    const lat = _.toNumber(_.get(req.query, 'lat'))
    const lon = _.toNumber(_.get(req.query, 'lon'))

    if (_.isFinite(lat) && _.isFinite(lon)) {
      const options = { lat, lon, filter: _.get(req.query, 'sources', '*') }
      // Some providers might support additional parameters
      if (_.has(req.query, 'distance')) options.distance = _.toNumber(_.get(req.query, 'distance'))
      if (_.has(req.query, 'limit')) options.limit = _.toInteger(_.get(req.query, 'limit'))
      
      const all = Providers.get().filter(provider => typeof provider.reverse === 'function').map(provider => provider.reverse(options))

      const response = []
      const results = await Promise.allSettled(all)
      results.forEach((result) => {
        if (result.status !== 'fulfilled') {
          app.logger.error(result.reason.toString())
          return
        }

        result.value.forEach((entry) => {
          const normalized = entry.feature
          normalized.geokoder = {
            source: entry.source
            // TODO: score by distance ?
            // score: scoreResult(q.toUpperCase(), entry.match.toUpperCase())
          }
          response.push(normalized)
        })
      })

      res.json(response)
    } else {
      throw new errors.BadRequest('Reverse geocoding expect decimal numbers for longitude and latitude')
    }
  })
}
