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
  const geocoders = app.get('geocoders')
  const apiPath = app.get('apiPath')

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

  app.get('/forward', async (req, res, next) => {
    const q = _.get(req.query, 'q')

    const all = []
    all.push(createKanoProvider(app).then((provider) => provider.forward(q)))
    all.push(createNodeGeocoderProvider(app).then((provider) => provider.forward(q)))
    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled')
        return

      response.splice(-1, 0, ...result.value)
    })

    res.json(response)
  })

  app.get('/reverse', async (req, res, next) => {
    const lat = _.get(req.query, 'lat')
    const lon = _.get(req.query, 'lon')

    const all = []
    all.push(createKanoProvider(app).then((provider) => provider.reverse({ lat, lon })))
    all.push(createNodeGeocoderProvider(app).then((provider) => provider.reverse({ lat, lon })))
    const response = []
    const results = await Promise.allSettled(all)
    results.forEach((result) => {
      if (result.status !== 'fulfilled')
        return

      response.splice(-1, 0, ...result.value)
    })

    res.json(response)
  })
}
