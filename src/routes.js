import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import errors from '@feathersjs/errors'
import makeDebug from 'debug'
import { scoreForwardResults, scoreReverseResults, sortAndLimitResults } from './scoring.js'
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
  const paginate = app.get('paginate')

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
    const options = { operation }
    const all = Providers.get().filter(provider => typeof provider[operation] === 'function').map(provider => provider.capabilities(options))

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
    const viewbox = _.get(req.query, 'viewbox', '')
    const options = { search: q, filter}
    if (viewbox) {
      // viewbox is expected as 'lon1,lat1,lon2,lat2'
      // parse as float and check validity
      const coords = viewbox.split(',').map(e => parseFloat(e))
      if (coords.length >= 4 && coords.every(e => e != NaN)) {
        options.viewbox = {
          minLon: Math.min(coords[0], coords[2]),
          maxLon: Math.max(coords[0], coords[2]),
          minLat: Math.min(coords[1], coords[3]),
          maxLat: Math.max(coords[1], coords[3])
        }
      }
    }
    // Some providers might support additional parameters
    if (_.has(req.query, 'limit')) options.limit = _.toInteger(_.get(req.query, 'limit'))
    else if (_.has(paginate, 'default.forward')) options.limit = _.get(paginate, 'default.forward')
    if (_.has(paginate, 'max.forward') && options.limit) options.limit = Math.min(options.limit, _.get(paginate, 'max.forward'))

    const all = Providers.get().filter(provider => typeof provider.forward === 'function').map(provider => provider.forward(options))

    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        app.logger.error(result.reason.toString())
        return
      }

      result.value.forEach((entry) => {
        const normalized = entry.feature

        if (!_.isNil(options.viewbox)) {
          // filter out features outside the viewbox if provided
          if ((normalized.geometry.coordinates[0] < options.viewbox.minLon) ||
              (normalized.geometry.coordinates[0] > options.viewbox.maxLon) ||
              (normalized.geometry.coordinates[1] < options.viewbox.minLat) ||
              (normalized.geometry.coordinates[1] > options.viewbox.maxLat))
              return
        }

        normalized.geokoder = {
          source: entry.source,
          match: entry.match,
          matchProp: entry.matchProp
        }
        response.push(normalized)
      })
    })

    // score and sort results
    scoreForwardResults(q, response)
    sortAndLimitResults(response, option.limit)

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
      else if (_.has(paginate, 'default.reverse')) options.limit = _.get(paginate, 'default.reverse')
      if (_.has(paginate, 'max.reverse') && options.limit) options.limit = Math.min(options.limit, _.get(paginate, 'max.reverse'))
      
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
          }
          response.push(normalized)
        })
      })

      // score and sort results
      scoreReverseResults(lon, lat, response)
      sortAndLimitResults(response, options.limit)

      res.json(response)
    } else {
      throw new errors.BadRequest('Reverse geocoding expect decimal numbers for longitude and latitude')
    }
  })
}
