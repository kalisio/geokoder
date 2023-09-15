import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import superagent from 'superagent'
import { fileURLToPath } from 'url'
import chai, { util, expect } from 'chai'
import chailint from 'chai-lint'
import { createServer } from '../src/main.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('geokoder:mbtiles', () => {
  let server, app
  const locations = [
    { lat: 43.31091, lon: 1.94750, distance: 0, sources: 'mairies', results: [] },
    { lat: 43.31091, lon: 1.94750, distance: 1000, sources: 'mairies', results: ['Castelnaudary'] },
    { lat: 43.31091, lon: 1.94750, distance: 0, sources: 'epci', results: ['CC Castelnaudary Lauragais Audois'] }
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

  it('mbtiles sources appear in capabilities', async () => {
    const response = await superagent
      .get(`${app.get('baseUrl')}/capabilities`)
    expect(response.body.includes('mairies')).beTrue()
    expect(response.body.includes('epci')).beTrue()
  })
  // Let enough time to process
    .timeout(10000)

  it('reverse geocoding on mbtiles sources', async () => {
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/reverse?lat=${location.lat}&lon=${location.lon}&distance=${location.distance}&sources=${location.sources}`)
      expect(response.body.length).to.equal(location.results.length)
      response.body.forEach((feature, index) => {
        expect(_.get(feature, 'properties.nom', '')).to.equal(location.results[index])
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  // Cleanup
  after(async () => {
    if (server) await server.close()
    fs.emptyDirSync(path.join(__dirname, 'logs'))
  })
})
