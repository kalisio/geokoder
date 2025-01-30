import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import superagent from 'superagent'
import { fileURLToPath } from 'url'
import chai, { util, expect } from 'chai'
import chailint from 'chai-lint'
import { createServer } from '../src/main.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('geokoder:node-geocoder', () => {
  let server, app
  const result = {
    streetName: 'Chemin des Tournesols', city: 'Castelnaudary', country: 'France'
  }
  const searches = [
    { pattern: 'Chemin des poireaux, 1100 Castelnaudary', sources: 'openstreetmap', results: [] },
    { pattern: '80 Chemin des tournesols, 11400 Castelnaudary', sources: 'opendatafrance', results: [result] },
    { pattern: '80 Chemin des tournesols, 11400 Castelnaudary', sources: 'open*', results: [result, result] },
    { pattern: '80 Chemin des tournesols, 11400 Castelnaudary', sources: 'opendatafrance', viewbox: '1.891365,43.283502,2.010069,43.340896', results: [result] },
    { pattern: '80 Chemin des tournesols, 11400 Castelnaudary', sources: 'opendatafrance', viewbox: '-2.915497,45.691553,-2.440681,45.911512', results: [] }
  ]
  const locations = [
    { lat: 45.15493, lon: 3.20801, sources: 'opendatafrance', results: [] },
    { lat: 43.29961, lon: 1.93729, sources: 'openstreetmap', results: [result] },
    { lat: 43.29961, lon: 1.93729, sources: 'open*', results: [result, result] }
  ]

  before(() => {
    chailint(chai, util)
  })

  it('is ES module compatible', () => {
    expect(typeof createServer).to.equal('function')
  })

  it('initialize the service', async () => {
    server = await createServer()
    expect(server).toExist()
    app = server.app
    expect(app).toExist()
  })
  // Let enough time to process
    .timeout(10000)

  it('node geocoder sources appear in capabilities', async () => {
    let response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/forward`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('openstreetmap')).beTrue()
    expect(response.body.geocoders.includes('opendatafrance')).beTrue()
    response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/reverse`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('openstreetmap')).beTrue()
    expect(response.body.geocoders.includes('opendatafrance')).beTrue()
  })
  // Let enough time to process
    .timeout(10000)

  it('forward geocoding on node geocoder sources', async () => {
    for (let i = 0; i < searches.length; i++) {
      const search = searches[i]
      const params = [ `q=${search.pattern}`, `sources=${search.sources}`, 'limit=2' ]
      if (search.viewbox) params.push(`viewbox=${search.viewbox}`)
      const response = await superagent
        .get(`${app.get('baseUrl')}/forward?${params.join('&')}`)
      expect(response.body.length).to.equal(search.results.length)
      response.body.forEach((feature, index) => {
        const result = search.results[index]
        expect(_.pick(feature.properties, Object.keys(result))).to.deep.equal(result)
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  it('reverse geocoding on node geocoder sources', async () => {
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/reverse?lat=${location.lat}&lon=${location.lon}&limit=2&sources=${location.sources}`)
      expect(response.body.length).to.equal(location.results.length)
      response.body.forEach((feature, index) => {
        const result = location.results[index]
        expect(_.pick(feature.properties, Object.keys(result))).to.deep.equal(result)
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  // Cleanup
  after(async () => {
    // if (server) await server.close()
    await app.teardown()
    fs.emptyDirSync(path.join(__dirname, 'logs'))
  })
})
