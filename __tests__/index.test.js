const ServerlessClient = require("../index");

jest.setTimeout(30000)

const sleep = delay =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delay);
  })

const generateMockConnections = async (n) => {
  const clients = []
  for (let i = 0; i < n; i++) {
    const c = new ServerlessClient({
      user: "postgres",
      host: "localhost",
      database: "postgres",
      password: "postgres",
      port: 5433,
    })

    await c.connect()
    clients.push(c)
  }

  return clients
}

const cleanMockConnections = async (clients) => {
  const requests = []
  for (const c of clients) {
    requests.push(c.end())
  }

  await Promise.all(requests)
}

/**
 * Those tests are kind of flaky and they are also testing private methods which is an anti-pattern,
 * they will not be run in the CI/CD pipeline but only on pre-commit to make sure nothing is broken.
 * Make sure your PostgreSQL is running and no other clients other than the test user is connected.
 */
describe("Serverless client", function() {
  describe("Default strategy minimum_idle_time", function() {
    let client;

    beforeEach(async function() {
      client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        connUtilization: 0.09,
      });
      await client.connect()
    });

    afterEach(async function() {
      await client.end()
    });

    it("should get the list of idles connections", async function() {
      const mockClients = await generateMockConnections(10)
      await sleep(1000)
      await mockClients[0].query('SELECT 1+1 AS result') // make a random client not idle

      const result = await client._getIdleProcessesListByMinimumTimeout()
      await cleanMockConnections(mockClients)

      // Should be 9 because one client has been used for a query and therefore is not in idle state anymore
      // or is idle state is less than 0.5 seconds
      expect(result).toHaveLength(9)
    });

    it("should get the list of idles connections with limit", async function() {
      client._strategy.maxIdleConnectionsToKill = 5
      const mockClients = await generateMockConnections(10)
      await sleep(1000)

      const result = await client._getIdleProcessesListByMinimumTimeout()
      await cleanMockConnections(mockClients)

      expect(result).toHaveLength(5)
    })

    it("should get an empty list of idles connections, idle time not passed", async function() {
      client._strategy.minConnIdleTimeSec = 2
      const mockClients = await generateMockConnections(10)
      await sleep(1000)

      const result = await client._getIdleProcessesListByMinimumTimeout()
      await cleanMockConnections(mockClients)

      expect(result).toHaveLength(0)
    })

    it("should kill the right number of connections", async function() {
      const mockClients = await generateMockConnections(10)
      await sleep(1000)
      await mockClients[0].query('SELECT 1+1 AS result') // make a random client not idle

      const result = await client.clean()
      await cleanMockConnections([mockClients[0]])

      expect(result).toHaveLength(9)
    })

    it("should set max connections from the db", async function() {
      const client1 = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        connUtilization: 0.09,
        debug: false,
        manualMaxConnections: true,
        maxConnections: 2
      })

      await client1.connect()

      expect(client1._maxConns.cache.total).toBe("100")
      expect(client1._maxConns.cache.updated > 0).toBeTruthy()

      await client1.end()
    });

    it("should cache process count", async function() {
      const client1 = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        processCountCacheEnabled: true,
        processCountFreqMs: 2000,
        debug: true
      })
      await client1.connect();
      const mockClients = await generateMockConnections(10);

      // At the beginning the cache count should be 0
      expect(client1._processCount.cache.count).toBe(0);

      // Upon invoking _getProcessCount it should set the cache
      const count = await client1._getProcessesCount();

      expect(client1._processCount.cache.count).toBe("12");
      expect(count).toBe(client1._processCount.cache.count)

      // More incoming connections, but the count should still be cached
      const moreMockClients = await generateMockConnections(10);
      const count2 = await client1._getProcessesCount();

      expect(count2).toBe(client1._processCount.cache.count)
      expect(client1._processCount.cache.count).toBe("12");

      // Wait for cache to expire and count again
      await sleep(2100)
      const count3 = await client1._getProcessesCount();

      expect(count3).toBe(client1._processCount.cache.count)
      expect(client1._processCount.cache.count).toBe("22");

      await client1.end()
      await cleanMockConnections([...mockClients, ...moreMockClients])
    });
  });

  describe("Ranked strategy", function() {
    let client;

    beforeEach(async function() {
      client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        connUtilization: 0.09,
        debug: false,
        strategy: "ranked"
      });
      await client.connect()
    });

    afterEach(async function() {
      await client.end()
    });

    it("should get process count without errors", async function() {
      const mockClients = await generateMockConnections(4)
      const result = await client._getProcessesCount();
      await cleanMockConnections(mockClients)

      expect(result).toBe("5")
    });

    it("should get list of processes count", async function() {
      const mockClients = await generateMockConnections(4)
      const result = await client._getIdleProcessesListOrderByDate();
      await cleanMockConnections(mockClients)

      expect(result).toHaveLength(4)
      expect(result.map(r => r.state)).toEqual(['idle', 'idle', 'idle', 'idle'])
    })

    it("should clean idle clients", async function() {
      await generateMockConnections(10)
      const result = await client.clean();

      expect(result).toHaveLength(10)
    })

    it("should not clean idle clients not enough clients connected", async function() {
      const mockClients = await generateMockConnections(4);
      const result = await client.clean();
      await cleanMockConnections(mockClients)

      expect(result).toBeUndefined()
    })
  });

  describe("Client", function() {
    it("should try to reconnect and fail after 3 attempt", async function() {
      const mockClients = await generateMockConnections(100)
      const client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        debug: true
      });

      try {
        await client.connect()

        expect(true).toBeFalsy()
      } catch (e) {
        await cleanMockConnections(mockClients)

        expect(client._backoff.retries).toBe(3)
        expect(e.message).toBe("sorry, too many clients already")
      }
    });

    it("should try to reconnect and succeed", async function() {
      const mockClients = await generateMockConnections(100)

      // End this client after one second so the connection reattempt can be successful
      setTimeout(async () => {
         mockClients[0].end()
      }, 1000)

      const client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        debug: true,
      });

      await client.connect()
      const result = await client.query("SELECT 1+1 AS result")

      expect(client._backoff.retries).toBe(0)

      await client.end()
      await cleanMockConnections([...mockClients.slice(1)])

      expect(result.rows[0].result).toBe(2)
    })


    it("Should reinitialize a client and query again", async function() {
      const client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5433,
        connUtilization: 0.09,
      });
      await client.connect()

      const mockClients = await generateMockConnections(1)
      const pid = mockClients[0]._client.processID
      // Simulate the process being killed by serverless-postgres
      await client._killProcesses([{pid}])

      // Try to query to a client that has been disconnected
      const result = await mockClients[0].query("SELECT 1+1 AS result")

      expect(mockClients[0]._backoff.queryRetries).toBe(0)

      await mockClients[0].end()
      await client.end()

      expect(result.rows[0].result).toBe(2)
    })

    it("should set password in the config and connect without errors", async function() {
      const client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        port: 5433,
        connUtilization: 0.09,
      });
      client.setConfig({
        password: "postgres"
      })
      await client.connect()
      const result = await client.query('SELECT 1+1 AS result')
      await client.end()

      expect(result.rows[0].result).toBe(2)
    })
  });

  describe("Validation", function() {
    [
      {
        name: 'should reject the instantiation an invalid strategy',
        args: {
          config: {
            user: "postgres",
            host: "localhost",
            database: "postgres",
            password: "postgres",
            port: 5433,
            strategy: 'invalid_strategy'
          }
        },
        wants: {
          errorMessage: "the provided strategy is invalid"
        }
      },
      {
        name: 'should reject the instantiation an invalid debug value',
        args: {
          config: {
            user: "postgres",
            host: "localhost",
            database: "postgres",
            password: "postgres",
            port: 5433,
            debug: []
          }},
        wants: {
          errorMessage: "debug must be of type Boolean"
        }
      },
      {
        name: 'should reject the instantiation an invalid maxIdleConnectionsToKill',
        args: {
          config: {
            user: "postgres",
            host: "localhost",
            database: "postgres",
            password: "postgres",
            port: 5433,
            maxIdleConnectionsToKill: "null"
          }},
        wants: {
          errorMessage: "maxIdleConnectionsToKill must be of type Number or null"
        }
      },
      {
        name: 'should reject the instantiation an invalid maxConnsFreqMs',
        args: {
          config: {
            user: "postgres",
            host: "localhost",
            database: "postgres",
            password: "postgres",
            port: 5433,
            maxConnsFreqMs: -200
          }},
        wants: {
          errorMessage: "maxConnsFreqMs must be of type Number"
        }
      },
      {
        name: 'should reject the instantiation an invalid connUtilization',
        args: {
          config: {
            user: "postgres",
            host: "localhost",
            database: "postgres",
            password: "postgres",
            port: 5433,
            connUtilization: 1.2
          }},
        wants: {
          errorMessage: "connUtilization must be of type Number"
        }
      }
    ].forEach(test => {
      it(test.name, function() {
        try {
          new ServerlessClient(test.args.config);

          expect(true).toBeFalsy()
        } catch (e) {

          expect(e.message).toBe(test.wants.errorMessage)
        }
      })
    })

    it("should persist the config object even when setConfig is called", async function() {
      const client = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        port: 5433,
        connUtilization: 0.09,
        debug: true,
        maxConnections: 500
      });
      client.setConfig({
        password: "postgres"
      })

      await client.connect()
      await client.end()

      expect(client._debug).toBe(true)
      expect(client._maxConns.cache.total).toBe(500)
    })

    it("should setConfig correctly and override previous options", async function() {
      const client = new ServerlessClient({
        user: "wrong user",
        host: "localhost",
        database: "postgres",
        password: "wrong password",
        port: 5433,
        connUtilization: 0.09,
        debug: true,
        maxConnections: 500
      });
      client.setConfig({
        user: "postgres",
        password: "postgres",
        debug: false,
        maxConnections: 8
      })

      await client.connect()
      await client.end()

      expect(client._debug).toBe(false)
      expect(client._maxConns.cache.total).toBe(8)
    })
  });
});
