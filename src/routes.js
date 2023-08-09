import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import path from 'path'
import _ from 'lodash'
import makeDebug from 'debug'
import { scoreResult } from './scoring.js'
import { createKanoProvider, createNodeGeocoderProvider } from './providers.js'

const debug = makeDebug('geokoder:routes')

// provider
//  => liste de sources
//  => forward, reverse
//
// kano feature services = provider
//  => sources = rte-units, hubeau-stations ...

export default async function (app) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageInfo = fs.readJsonSync(path.join(__dirname, '..', 'package.json'))
  const geocoders = app.get('geocoders')
  const apiPath = app.get('apiPath')

  app.get(`/healthcheck`, (req, res, next) => {
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

  /*
  app.get('/providers', async (req, res, next) => {
    const providers = [ 'kano' ]
    res.json(providers)
  })
  */

  /*
  app.get('/providers', async (req, res, next) => {
    const providers = [ 'kano' ]
    res.json(providers)
  })
  */

  app.get('/capabilities', async (req, res, next) => {
    const all = []
    all.push(createKanoProvider(app).then((provider) => provider.capabilities()))
    all.push(createNodeGeocoderProvider(app).then((provider) => provider.capabilities()))

    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled')
        return

      response.splice(-1, 0, ...result.value)
    })

    res.json(response)
  })

  app.get('/forward', async (req, res, next) => {
    const q = _.get(req.query, 'q')
    const filter = _.get(req.query, 'sources', '*')

    const all = []
    all.push(createKanoProvider(app).then((provider) => provider.forward(q, filter)))
    all.push(createNodeGeocoderProvider(app).then((provider) => provider.forward(q, filter)))
    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled')
        return

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
      return a.geokoder.score < b.geokoder.score ?
        1 : a.geokoder.score > b.geokoder.score ?
        -1 : 0
    })

    res.json(response)
  })

  app.get('/reverse', async (req, res, next) => {
    const lat = parseFloat(_.get(req.query, 'lat'))
    const lon = parseFloat(_.get(req.query, 'lon'))

    if (lat !== NaN && lon !== NaN) {
      const all = []
      all.push(createKanoProvider(app).then((provider) => provider.reverse({ lat, lon })))
      all.push(createNodeGeocoderProvider(app).then((provider) => provider.reverse({ lat, lon })))
      const response = []
      const results = await Promise.allSettled(all)
      results.forEach((result) => {
        if (result.status !== 'fulfilled')
          return

        result.value.forEach((entry) => {
          const normalized = entry.feature
          normalized.geokoder = {
            source: entry.source,
            // TODO: score by distance ?
            // score: scoreResult(q.toUpperCase(), entry.match.toUpperCase())
          }
          response.push(normalized)
        })
      })

      res.json(response)
    } else {
      // TODO: ?
    }
  })
}
