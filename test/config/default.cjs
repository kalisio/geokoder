const path = require('path')
const containerized = require('containerized')()

// Use default service config
const config = require(path.join(__dirname, '../../config/default.cjs'))

// Simply changes outputs so we don't pollute logs, etc.
config.logs.DailyRotateFile.dirname = path.join(__dirname, '..', 'logs')
// Use cote defaults to speedup tests
config.distribution.cote = { 
  helloInterval: 2000,
  checkInterval: 4000,
  nodeTimeout: 5000,
  masterTimeout: 6000
}
config.distribution.publicationDelay = 3000
config.distribution.remoteServices = (service) => (service.key === 'geokoder-test')
// This is for KDK test app
config.db = {
  adapter: 'mongodb',
  url: (containerized ? 'mongodb://mongodb:27017/geokoder-test' : 'mongodb://127.0.0.1:27017/geokoder-test')
}

module.exports = config
