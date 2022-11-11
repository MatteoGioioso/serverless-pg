class Postgres {
  constructor() {
  }

  getIdleProcessesListByMinimumTimeout(serverlessPgSelf) {
    const query = `
      WITH processes AS (
          SELECT EXTRACT(EPOCH FROM (Now() - state_change)) AS idle_time,
                 pid
          FROM pg_stat_activity
          WHERE usename = $1
            AND datname = $2
            AND state = 'idle'
            AND application_name = $5
      )
      SELECT pid
      FROM processes
      WHERE idle_time > $3
      LIMIT $4;`

    const values = [
      serverlessPgSelf._client.user,
      serverlessPgSelf._client.database,
      serverlessPgSelf._strategy.minConnIdleTimeSec,
      serverlessPgSelf._strategy.maxIdleConnectionsToKill,
      serverlessPgSelf._application_name
    ]

    return [query, values]
  }

  getIdleProcessesListOrderByDate(serverlessPgSelf) {
    const query = `
      SELECT pid, backend_start, state
      FROM pg_stat_activity
      WHERE datname = $1
        AND state = 'idle'
        AND usename = $2
        AND application_name = $4
      ORDER BY state_change
      LIMIT $3;`

    const values = [
      serverlessPgSelf._client.database,
      serverlessPgSelf._client.user,
      serverlessPgSelf._strategy.maxIdleConnectionsToKill,
      serverlessPgSelf._application_name
    ]

    return [query, values]
  }

  processCount(serverlessPgSelf){
    const query = `
        SELECT COUNT(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND usename = $2
          AND application_name = $3;`

    const values = [serverlessPgSelf._client.database, serverlessPgSelf._client.user, serverlessPgSelf._application_name]

    return [query, values]
  }

  killProcesses(serverlessPgSelf, pids){
    const query = `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid = ANY ($1)
        AND state = 'idle'
        AND application_name = $2;`

    const values = [pids, serverlessPgSelf._application_name]

    return [query, values]
  }

  showMaxConnections(serverlessPgSelf) {
    return [`SHOW max_connections`]
  }
}

module.exports = Postgres