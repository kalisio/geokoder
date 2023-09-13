const path = require('path')

// Use default service config
const config = require(path.join(__dirname, '../../config/default.cjs'))

// Simply changes outputs so we don't pollute logs, etc.
config.logs.DailyRotateFile.dirname = path.join(__dirname, '..', 'logs')

module.exports = config
