/**
 * This module manages PostgreSQL connections in serverless applications.
 * This module wrap node-postgres package, more detail regarding it can be found here:
 * https://github.com/brianc/node-postgres
 * @author Matteo Gioioso <matteo@hirvitek.com>
 * @version 1.3.0
 * @license MIT
 */

const { isValidStrategy, type, validateNum, isWithinRange } = require("./utils");
const { Client } = require("pg");

function ServerlessClient(config) {
  this._client = null;
  this.setConfig(config)
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
    const maxConnections = results.rows[0].max_connections

    __self._logger("Getting max connections from database...", maxConnections)

    __self._maxConns.cache = {
      total: maxConnections,
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
    this._client.database,
    this._client.user,
    this._strategy.maxIdleConnectionsToKill
  ]

  try {
    const result = await this._client.query(query, values);

    return result.rows
  } catch (e){
    this._logger("Swallowed internal error", e.message)
    // Swallow the error, if this produce an error there is no need to error the function
    return []
  }
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
    this._client.user,
    this._client.database,
    this._strategy.minConnIdleTimeSec,
    this._strategy.maxIdleConnectionsToKill
  ]

  try {
    const result = await this._client.query(query, values)

    return result.rows
  } catch (e) {
    this._logger("Swallowed internal error", e.message)
    // Swallow the error, if this produce an error there is no need to error the function
    return []
  }
}

ServerlessClient.prototype._getProcessesCount = async function() {
  function isCacheExpiredOrDisabled(__self) {
    // If cache is disabled
    if (!__self._processCount.cacheEnabled) {
      return true
    }
    // If cache is enabled check if it is expired
    return Date.now() - __self._processCount.cache.updated > __self._processCount.freqMs
  }

  if (isCacheExpiredOrDisabled(this)) {
    const query = `
        SELECT COUNT(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND usename = $2;`

    const values = [this._client.database, this._client.user]

    try {
      const result = await this._client.query(query, values);
      this._processCount.cache = {
        count: result.rows[0].count || 0,
        updated: Date.now()
      }

      return result.rows[0].count;
    } catch (e) {
      this._logger("Swallowed internal error", e.message)
      // Swallow the error, if this produce an error there is no need to error the function
      return 0
    }
  }

  // Return cached value
  return this._processCount.cache.count
};

ServerlessClient.prototype._killProcesses = async function(processesList) {
  const pids = processesList.map(proc => proc.pid);

  const query = `
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE pid = ANY ($1) AND state='idle';`

  const values = [pids]

  try {
    return await this._client.query(query, values)
  } catch (e){
    this._logger("Swallowed internal error", e.message)
    // Swallow the error, if this produce an error there is no need to error the function

    return {
      rows: []
    }
  }
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
    if (processesList.length) {
      const killedProcesses = await this._killProcesses(processesList);
      this._logger("+++++ Killed processes: ", killedProcesses.rows.length, " +++++")
      return killedProcesses.rows
    }
  }
};

ServerlessClient.prototype._init = async function(){
  if(this._client !== null){
    return
  }

  this._client = new Client(this._config)

  // pg throws an error if we terminate the connection, therefore we need to swallow these errors
  // and throw the rest
  this._client.on("error", err => {
    if (
      err.message === "terminating connection due to administrator command" ||
      err.message === "Connection terminated unexpectedly"
    ) {
      // Swallow the error
      this._logger("Swallowed error: ", err.message)
    } else if (err.message === "sorry, too many clients already") {
      throw err;
    } else {
      throw err;
    }
  });

  await this._client.connect();
  this._logger("Connected...")

  if (this._maxConns.manualMaxConnections){
    await this._setMaxConnections(this)
  }

  this._logger("Max connections: ", this._maxConns.cache.total)
}

ServerlessClient.prototype._validateConfig = function(config){
  const {
    manualMaxConnections,
    maxConnsFreqMs,
    maxConnections,
    strategy,
    debug,
    maxIdleConnectionsToKill,
    minConnectionIdleTimeSec,
    connUtilization,
    capMs,
    baseMs,
    delayMs,
    maxRetries
  } = config

  if (
    manualMaxConnections &&
    type(manualMaxConnections) !== "Boolean"
  ){
    throw new Error("manualMaxConnections must be of type Boolean")
  }

  if (debug && type(debug) !== "Boolean"){
    throw new Error("debug must be of type Boolean")
  }

  if (validateNum(maxConnsFreqMs)){
    throw new Error("maxConnsFreqMs must be of type Number")
  }

  if (validateNum(maxConnections)){
    throw new Error("maxConnections must be of type Number")
  }

  if (strategy && !isValidStrategy(strategy)){
    throw new Error("the provided strategy is invalid")
  }

  if (validateNum(maxIdleConnectionsToKill)){
    throw new Error("maxIdleConnectionsToKill must be of type Number or null")
  }

  if (validateNum(minConnectionIdleTimeSec)){
    throw new Error("minConnectionIdleTimeSec must be of type Number")
  }

  if (validateNum(connUtilization) || !isWithinRange(connUtilization, 0, 1)){
    throw new Error("connUtilization must be of type Number")
  }

  if (validateNum(capMs)){
    throw new Error("capMs must be of type Number")
  }

  if (validateNum(baseMs)){
    throw new Error("baseMs must be of type Number")
  }

  if (validateNum(delayMs)){
    throw new Error("delayMs must be of type Number")
  }

  if (validateNum(maxRetries)){
    throw new Error("maxRetries must be of type Number")
  }
}

ServerlessClient.prototype.setConfig = function (config) {
  this._validateConfig(config)
  this._config = { ...this._config, ...config };

  this._maxConns = {
    // Cache expiration for getting the max connections value in milliseconds
    freqMs: this._config.maxConnsFreqMs || 60000,
    // If this parameters is set to true it will query to get the maxConnections values,
    // to maximize performance you should set the maxConnections yourself.
    // Is suggested to manually set the maxConnections and keep this setting to false.
    manualMaxConnections: this._config.manualMaxConnections,
    cache: {
      total: this._config.maxConnections || 100,
      updated: 0
    }
  }

  this._processCount = {
    // Cache expiration for getting the process count value value in milliseconds
    freqMs: this._config.processCountFreqMs || 6000,
    cacheEnabled: this._config.processCountCacheEnabled,
    cache: {
      count: 0,
      updated: 0
    }
  }

  // Strategy
  this._strategy = {
    name: this._config.strategy || 'minimum_idle_time',
    // The minimum number of seconds that a connection must be idle before the module will recycle it.
    minConnIdleTimeSec: this._config.minConnectionIdleTimeSec || 0.5,
    // The bigger, the more idle connections will be killed
    // this parameters control how aggressive is going to be your strategy
    // default is null which will means LIMIT ALL
    maxIdleConnectionsToKill: this._config.maxIdleConnectionsToKill || null,

    // The percentage of total connections to use when connecting to your Postgres server.
    // A value of 0.75 would use 75% of your total available connections.
    // Past this threshold the connection killer will kick in.
    connUtilization: this._config.connUtilization || 0.8
  }

  // Activate debugging logger
  this._debug = this._config.debug

  // Backoff
  this._backoff = {
    capMs: this._config.capMs || 1000,
    baseMs: this._config.baseMs || 2,
    delayMs: this._config.delayMs || 1000,
    maxRetries: this._config.maxRetries || 3,
    retries: 0,
    queryRetries: 0
  }
}

ServerlessClient.prototype._logger = function(...args) {
  if (this._debug){
    const pid = this._client && this._client.processID || 'offline'
    console.log('serverless-pg | pid: ', pid, ' | ',  ...args)
  }
}

ServerlessClient.prototype.connect = async function() {
  try {
    await this._init();
  } catch (e) {
    if (
      e.message === "sorry, too many clients already" ||
      e.message === "Connection terminated unexpectedly" ||
      e.message === "terminating connection due to administrator command"
    ) {
      this._client = null
      // Client in node-pg is usable only one time, once it errors we cannot re-connect again,
      // therefore we need to throw the instance and recreate a new one
      if (this._backoff.retries < this._backoff.maxRetries) {
        this._logger("trying to reconnect...attempt: ", this._backoff.retries)
        const totalDelay = this._decorrelatedJitter(this._backoff.delayMs)
        this._logger("total delay: ", totalDelay)
        await this._sleep(totalDelay);
        this._backoff.retries++;
        await this.connect();
        this._backoff.retries = 0
      } else {
        throw e
      }
    } else {
      throw e;
    }
  }
};

ServerlessClient.prototype.query = async function(...args){
  try {
    this._logger("Start query...")
    // We fulfill the promise to catch the error
    return await this._client.query(...args)
  } catch (e) {
    // If a client has been terminated by serverless-postgres and try to query again
    // we re-initialize it and retry
    this._client = null

    if (
      e.message === "Client has encountered a connection error and is not queryable" ||
      e.message === "terminating connection due to administrator command" ||
      e.message === "Connection terminated unexpectedly"
    ){
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
  await this._client.end()
  this._client = null
}

ServerlessClient.prototype.on = function(...args){
  this._client.on(...args)
}

module.exports = { ServerlessClient };
