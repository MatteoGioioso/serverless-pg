const {Client} = require("pg");

function ServerlessClient(config) {
  Client.call(this, config);

  // pg throws an error if we terminate the connection, therefore we need to swallow the error
  this.on("error", err => {
    if (
      err.message === "terminating connection due to administrator command" ||
      err.message === "Connection terminated unexpectedly"
    ) {
      // console.info(err.message);
    } else {
      throw err;
    }
  });

  this.end = async() => {
    const processesList = (await this._showProcessList(this)).rows.map(row => {
      const epoch = new Date(row.backend_start).getTime();
      return {
        timeElapsed: Date.now() - epoch,
        pid: row.pid,
        state: row.state
      };
    });

    if (processesList.length === 90) {
      const pid = this._getFirstIdleConnectionPid(processesList);
      await this._killProcess(pid);
    }
  };

  this._killProcess = async (processId) => {
    return this.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = '${processId}' AND datname = '${config.database}';`
    );
  };

  this._showProcessList = async () => {
    return this.query(
      "SELECT pid,usename,backend_start,state,client_addr FROM pg_stat_activity WHERE datname='postgres' ;"
    );
  };

  this._getFirstIdleConnectionPid = (processesList) => {
    const proc = processesList.find(proc => proc.state === "idle");
    return proc.pid;
  };
}

ServerlessClient.prototype = new Client();
ServerlessClient.prototype.constructor = ServerlessClient;

module.exports = ServerlessClient;
