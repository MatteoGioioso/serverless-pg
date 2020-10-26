const { Client } = require("pg");

function ServerlessClient(config) {
  Client.call(this, config);

  this._config = config;
  this._maxRetries = config.maxRetries || 10;
  this._maxConnections = config.maxConnections || 100;

  // The bigger the slower, but more impactful on the connections dropped
  this._maxRetrivedProcesses = config.maxRetrivedProcesses || 10;

  // This number represent the percentage threshold at which the cleanup will be triggered.
  // Ex: if you have 100 max connections and processesPercentageThreshold set at 60 (%),
  // then it will start dropping connections if the total idle connections count is more than 60
  this._processesPercentageThreshold = (config.processesPercentageThreshold || 50) / 100
  this._retries = 1;

  // pg throws an error if we terminate the connection, therefore we need to swallow these errors
  // and throw the rest
  this.on("error", err => {
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
}

ServerlessClient.prototype = new Client();
ServerlessClient.prototype.constructor = ServerlessClient;
ServerlessClient.prototype._sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  });

ServerlessClient.prototype._getIdleProcessesListOrderByDate = async function() {
  return this.query(
    `SELECT pid,backend_start,state 
        FROM pg_stat_activity 
        WHERE datname=$1 AND state='idle' 
        ORDER BY backend_start 
        DESC LIMIT $2;`,
    [this._config.database, this._maxRetrivedProcesses]
  );
};

ServerlessClient.prototype._getProcessesCount = async function() {
  const result = await this.query(
    "SELECT COUNT(pid) FROM pg_stat_activity WHERE datname=$1 AND state='idle';",
    [this._config.database]
  );

  return result.rows[0].count;
};

ServerlessClient.prototype._killProcesses = async function(processesList) {
  const pids = processesList.rows.map(proc => proc.pid);
  const query = `
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE pid = ANY ($1) 
      AND datname = $2 AND state='idle';`
  const values = [pids, this._config.database]

  return this.query(query, values)
};

ServerlessClient.prototype.clean = async function() {
  const processCount = await this._getProcessesCount();

  if (processCount > this._maxConnections * this._processesPercentageThreshold) {
    const processesList = await this._getIdleProcessesListOrderByDate();
    await this._killProcesses(processesList);
  }
};

ServerlessClient.prototype.sconnect = async function() {
  try {
    await this.connect();
  } catch (e) {
    if (e.message === "sorry, too many clients already") {
      const backoff = async delay => {
        if (this._maxRetries > 0) {
          console.log(this._maxRetries, " trying to reconnect... ");
          await this._sleep(delay);
          this._maxRetries--;
          await this.sconnect();
          console.log("Re-connection successful!");
        }
      };

      this._retries++;
      let delay = 1000 * this._retries;
      await backoff(delay);
    } else {
      throw e;
    }
  }
};

module.exports = { ServerlessClient };
