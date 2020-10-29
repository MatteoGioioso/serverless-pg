/**
 * This module manages PostgreSQL connections in serverless applications.
 * This module wrap node-postgres package, more detail regarding it can be found here:
 * https://github.com/brianc/node-postgres
 * @author Matteo Gioioso <matteo@hirvitek.com>
 * @version 1.3.0
 * @license MIT
 */

const { Client } = require("pg");

function ServerlessClient(config) {
  this._config = config;

  this._maxConns = {
    // Cache expiration for getting the max connections value in milliseconds
    freqMs: config.maxConnsFreqMs || 60000,
    // If this parameters is set to true it will query to get the maxConnections values,
    // to maximize performance you should set the maxConnections yourself.
    // Is suggested to manually set the maxConnections and keep this setting to false.
    automaticMaxConnections: config.automaticMaxConnections,
    cache: {
      total: config.maxConnections || 100,
      updated: 0
    }
  }

  // Strategy
  this._strategy = {
    name: config.strategy || 'minimum_idle_time',
    // The minimum number of seconds that a connection must be idle before the module will recycle it.
    minConnIdleTimeSec: config.minConnectionIdleTimeSec || 0.5,
    // The bigger, the more idle connections will be killed
    // this parameters control how aggressive is going to be your strategy
    // default is null which will means LIMIT ALL
    maxIdleConnectionsToKill: config.maxIdleConnectionsToKill || null,

    // The percentage of total connections to use when connecting to your Postgres server.
    // A value of 0.75 would use 75% of your total available connections.
    // Past this threshold the connection killer will kick in.
    connUtilization: config.connUtilization || 0.8
  }

  // Activate debugging logger
  this._debug = config.debug

  // Backoff
  this._backoff = {
    capMs: config.capMs || 1000,
    baseMs: config.baseMs || 2,
    delayMs: config.delayMs || 1000,
    maxRetries: config.maxRetries || 3,
    retries: 0,
    queryRetries: 0
  }
}

ServerlessClient.prototype.constructor = ServerlessClient;
ServerlessClient.prototype._sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

ServerlessClient.prototype._setMaxConnections = async (__self) => {
  // If cache is expired
  if (Date.now() - __self._maxConns.cache.updated > __self._maxConns.freqMs) {
    const results = await __self._client.query(`SHOW max_connections`)

    __self._logger("Getting max connections from database...")

    __self._maxConns.cache = {
      total: results.rows[0].max_connections,
      updated: Date.now()
    }
  }
}

// This strategy arbitrarily (maxIdleConnections) terminates connections starting from the oldest one in idle.
// It is very aggressive and it can cause disruption if a connection was in idle for a short period of time
ServerlessClient.prototype._getIdleProcessesListOrderByDate = async function() {
  const query = `
    SELECT pid,backend_start,state 
    FROM pg_stat_activity 
    WHERE datname=$1 
      AND state='idle' 
      AND usename=$2
    ORDER BY state_change 
    LIMIT $3;`

  const values = [
    this._config.database,
    this._config.user,
    this._strategy.maxIdleConnectionsToKill
  ]

  const result = await this._client.query(query, values);

  return result.rows
};

// This strategy select only the connections that have been in idle state for more
// than a minimum amount of seconds, it is very accurate as it only takes the process that have been in idle
// for more than a threshold time (minConnectionTimeoutSec)
ServerlessClient.prototype._getIdleProcessesListByMinimumTimeout = async function(){
  const query = `
    WITH processes AS(
      SELECT
         EXTRACT(EPOCH FROM (Now() - state_change)) AS idle_time,
         pid
      FROM pg_stat_activity
      WHERE usename=$1 
        AND datname=$2 
        AND state='idle'
    )
    SELECT pid 
    FROM processes 
    WHERE idle_time > $3 
    LIMIT $4;`

  const values = [
    this._config.user,
    this._config.database,
    this._strategy.minConnIdleTimeSec,
    this._strategy.maxIdleConnectionsToKill
  ]

  const result = await this._client.query(query, values)

  return result.rows
}

ServerlessClient.prototype._getProcessesCount = async function() {
  const query = `
    SELECT COUNT(pid) 
    FROM pg_stat_activity 
    WHERE datname=$1 
      AND usename=$2;`

  const values = [this._config.database, this._config.user]

  const result = await this._client.query(query, values);

  return result.rows[0].count;
};

ServerlessClient.prototype._killProcesses = async function(processesList) {
  const pids = processesList.map(proc => proc.pid);

  const query = `
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE pid = ANY ($1);`

  const values = [pids]

  return this._client.query(query, values)
};

ServerlessClient.prototype._getStrategy = function(){
  switch (this._strategy.name) {
    case "minimum_idle_time":
      return this._getIdleProcessesListByMinimumTimeout.bind(this)
    case "ranked":
      return this._getIdleProcessesListOrderByDate.bind(this)
    default:
      return this._getIdleProcessesListByMinimumTimeout.bind(this)
  }
}

ServerlessClient.prototype._decorrelatedJitter = function(delay){
  const cap = this._backoff.capMs;
  const base = this._backoff.baseMs;
  const randRange = (min,max) => Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(cap, randRange(base, delay * 3));
}

ServerlessClient.prototype.clean = async function() {
  const processCount = await this._getProcessesCount();
  this._logger("Current process count: ", processCount);

  if (processCount > this._maxConns.cache.total * this._strategy.connUtilization) {
    const strategy = this._getStrategy();
    const processesList = await strategy();
    const killedProcesses = await this._killProcesses(processesList);
    this._logger("+++++ Killed processes: ", killedProcesses.rows.length, " +++++")
    return killedProcesses.rows
  }
};

ServerlessClient.prototype.connect = async function() {
  try {
    await this._init();
  } catch (e) {
    if (e.message === "sorry, too many clients already") {
      // Client in node-pg is usable only one time, once it errors we cannot re-connect again,
      // therefore we need to throw the instance and recreate a new one
      if (this._backoff.retries < this._backoff.maxRetries) {
        this._logger("trying to reconnect...attempt: ", this._backoff.retries)
        const totalDelay = this._decorrelatedJitter(this._backoff.delayMs)
        this._logger("total delay: ", totalDelay)
        await this._sleep(totalDelay);
        this._backoff.retries++;
        await this.connect();
      } else {
        throw e
      }
    } else {
      throw e;
    }
  }
};

ServerlessClient.prototype._init = async function(){
  this._client = new Client(this._config)

  // pg throws an error if we terminate the connection, therefore we need to swallow these errors
  // and throw the rest
  this._client.on("error", err => {
    if (
      err.message === "terminating connection due to administrator command" ||
      err.message === "Connection terminated unexpectedly"
    ) {
      // Swallow the error
    } else if (err.message === "sorry, too many clients already") {
      throw err;
    } else {
      throw err;
    }
  });

  await this._client.connect();
  this._backoff.retries = 0

  if (this._maxConns.automaticMaxConnections){
    await this._setMaxConnections(this)
  }

  this._logger("Max connections: ", this._maxConns.cache.total)
}

// TODO add validation for the client config
ServerlessClient.prototype._validateConfig = function(){

}

ServerlessClient.prototype._logger = function(...args) {
  if (this._debug){
    console.log('\x1b[36m%s\x1b[0m', 'serverless-pg | ', ...args)
  }
}

ServerlessClient.prototype.query = async function(...args){
  try {
    // We fulfill the promise to catch the error
    return await this._client.query(...args)
  } catch (e) {
    // If a client has been terminated by serverless-postgres and try to query again
    // we re-initialize it and retry
    if (e.message === "Client has encountered a connection error and is not queryable"){
      if (this._backoff.queryRetries < this._backoff.maxRetries) {
        this._logger("Retry query...attempt: ", this._backoff.queryRetries)
        const totalDelay = this._decorrelatedJitter(this._backoff.delayMs)
        this._logger("total delay: ", totalDelay)
        await this._sleep(totalDelay);
        this._backoff.queryRetries++;
        await this.connect()
        const result = await this.query(...args)
        this._backoff.queryRetries = 0
        return result
      } else {
        throw e
      }
    }
    throw e
  }
}

ServerlessClient.prototype.end = async function(){
  this._backoff.retries = 0
  this._backoff.queryRetries = 0
  const result = await this._client.end()
  this._client = null
  return result
}

ServerlessClient.prototype.on = function(...args){
  return this._client.on(...args)
}

module.exports = { ServerlessClient };
