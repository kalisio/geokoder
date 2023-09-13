import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'
import chai, { util, expect } from 'chai'
import chailint from 'chai-lint'
import { createServer } from '../src/main.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('geokoder:mbtiles', () => {
  let server, app

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

  // Cleanup
  after(async () => {
    if (server) await server.close()
    fs.emptyDirSync(path.join(__dirname, 'logs'))
  })
})
