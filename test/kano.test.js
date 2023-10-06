import utility from 'util'
import _ from 'lodash'
import path from 'path'
import fs from 'fs-extra'
import superagent from 'superagent'
import { fileURLToPath } from 'url'
import chai, { util, expect } from 'chai'
import chailint from 'chai-lint'
import distribution, { finalize } from '@kalisio/feathers-distributed'
import { kdk } from '@kalisio/kdk/core.api.js'
import { createFeaturesService, createCatalogService, removeCatalogService } from '@kalisio/kdk/map.api.js'
import { createServer } from '../src/main.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('geokoder:kano', () => {
  let server, app, kapp, catalogService, defaultLayers, telerayStationsService, rteUnitsService
  const searches = [
    { pattern: 'xxx', sources: 'kano:teleray-stations', results: [] },
    { pattern: 'aye', sources: 'kano:teleray-stations', results: ['BLAYE'] },
    { pattern: 'chin', sources: 'kano:*', results: ['CHINON', 'Chinon-B1', 'Chinon-B2'] }
  ]
  const locations = [
    { lat: 47.16, lon: 0.24, distance: 0, sources: 'kano:teleray-stations', results: [] },
    { lat: 47.16, lon: 0.24, distance: 1000, sources: 'kano:teleray-stations', results: ['CHINON'] },
    { lat: 47.16, lon: 0.24, distance: 10000, sources: 'kano:rte-units', results: ['Chinon-B1', 'Chinon-B2'] }
  ]

  before(() => {
    chailint(chai, util)
  })

  it('is ES module compatible', () => {
    expect(typeof createServer).to.equal('function')
  })

  it('initialize the remote app', async () => {
    kapp = kdk()
    // Distribute services
    await kapp.configure(distribution({
      // Use cote defaults to speedup tests
      cote: {
        helloInterval: 2000,
        checkInterval: 4000,
        nodeTimeout: 5000,
        masterTimeout: 6000
      },
      publicationDelay: 3000,
      key: 'geokoder-test',
      // Distribute only the test services
      services: (service) => service.path.includes('teleray') ||
                             service.path.includes('rte') ||
                             service.path.includes('catalog')
    }))
    await kapp.db.connect()
    // Create a global catalog service
    await createCatalogService.call(kapp)
    catalogService = kapp.getService('catalog')
    expect(catalogService).toExist()
  })
  // Let enough time to process
    .timeout(5000)

  it('registers the kano layers', async () => {
    const layers = await fs.readJson(path.join(__dirname, 'config/layers.json'))
    expect(layers.length > 0)
    // Create layers
    defaultLayers = await catalogService.create(layers)
    // Single layer case
    if (!Array.isArray(defaultLayers)) defaultLayers = [defaultLayers]
    expect(defaultLayers.length > 0)
  })

  it('create and feed the kano services', async () => {
    // Create the services
    await createFeaturesService.call(kapp, {
      collection: 'teleray-stations',
      featureId: 'irsnId',
      featureLabel: 'name'
    })
    await createFeaturesService.call(kapp, {
      collection: 'rte-units',
      featureId: 'eicCode',
      featureLabel: 'name'
    })
    telerayStationsService = kapp.getService('teleray-stations')
    expect(telerayStationsService).toExist()
    rteUnitsService = kapp.getService('rte-units')
    expect(rteUnitsService).toExist()
    // Feed the collections
    let stations = fs.readJsonSync(path.join(__dirname, 'data/teleray.stations.json')).features
    await telerayStationsService.create(stations)
    stations = fs.readJsonSync(path.join(__dirname, 'data/rte.units.json')).features
    await rteUnitsService.create(stations)
  })
  // Let enough time to process
    .timeout(5000)

  it('initialize the geokoder service', async () => {
    server = await createServer()
    expect(server).toExist()
    app = server.app
    expect(app).toExist()
    // Wait long enough to be sure distribution is up
    await utility.promisify(setTimeout)(10000)
  })
  // Let enough time to process
    .timeout(15000)

  it('kano sources from catalog appear in capabilities', async () => {
    let response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/forward`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('kano:teleray-stations')).beTrue()
    expect(response.body.geocoders.includes('kano:rte-units')).beTrue()
    response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/reverse`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('kano:teleray-stations')).beTrue()
    expect(response.body.geocoders.includes('kano:rte-units')).beTrue()
  })
  // Let enough time to process
    .timeout(10000)

  it('forward geocoding on kano sources from catalog', async () => {
    for (let i = 0; i < searches.length; i++) {
      const search = searches[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/forward?q=${search.pattern}&sources=${search.sources}`)
      expect(response.body.length).to.equal(search.results.length)
      response.body.forEach((feature, index) => {
        expect(_.get(feature, 'properties.name', '')).to.equal(search.results[index])
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  it('reverse geocoding on kano sources from catalog', async () => {
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/reverse?lat=${location.lat}&lon=${location.lon}&distance=${location.distance}&sources=${location.sources}`)
      expect(response.body.length).to.equal(location.results.length)
      response.body.forEach((feature, index) => {
        expect(_.get(feature, 'properties.name', '')).to.equal(location.results[index])
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  it('kano sources from services appear in capabilities', async () => {
    // Remove the global catalog service
    await catalogService.Model.drop()
    await removeCatalogService.call(kapp)
    catalogService = kapp.getService('catalog')
    expect(catalogService).beNull()

    let response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/forward`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('services:teleray-stations')).beTrue()
    expect(response.body.geocoders.includes('services:rte-units')).beTrue()
    response = await superagent
      .get(`${app.get('baseUrl')}/capabilities/reverse`)
    expect(response.body.geocoders).toExist()
    expect(response.body.geocoders.includes('services:teleray-stations')).beTrue()
    expect(response.body.geocoders.includes('services:rte-units')).beTrue()
  })
  // Let enough time to process
    .timeout(10000)

  it('forward geocoding on kano sources from services', async () => {
    for (let i = 0; i < searches.length; i++) {
      const search = searches[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/forward?q=${search.pattern}&sources=${search.sources.replace('kano', 'services')}`)
      expect(response.body.length).to.equal(search.results.length)
      response.body.forEach((feature, index) => {
        expect(_.get(feature, 'properties.name', '')).to.equal(search.results[index])
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  it('reverse geocoding on kano sources from services', async () => {
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i]
      const response = await superagent
        .get(`${app.get('baseUrl')}/reverse?lat=${location.lat}&lon=${location.lon}&distance=${location.distance}&sources=${location.sources.replace('kano', 'services')}`)
      expect(response.body.length).to.equal(location.results.length)
      response.body.forEach((feature, index) => {
        expect(_.get(feature, 'properties.name', '')).to.equal(location.results[index])
      })
    }
  })
  // Let enough time to process
    .timeout(10000)

  // Cleanup
  after(async () => {
    if (server) await server.close()
    finalize(kapp)
    fs.emptyDirSync(path.join(__dirname, 'logs'))
    await telerayStationsService.Model.drop()
    await rteUnitsService.Model.drop()
    await kapp.db.disconnect()
  })
})
