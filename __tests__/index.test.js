const ServerlessClient = require("../index");

const generateMockConnections = async (n) => {
  const clients = []
  for (let i = 0; i < n; i++) {
    const c = new ServerlessClient({
      user: "postgres",
      host: "localhost",
      database: "postgres",
      password: "postgres",
      port: 5432
    })

    await c.sconnect()
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
 * Those test are kind of flaky, make sure your PostgreSQL is running and no other clients
 * other than the test process is connected
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
        port: 5432,
        connUtilization: 0.09,
        debug: false,
      });
    });


    it("should set max connections from the db", async function() {
      const client1 = new ServerlessClient({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5432,
        connUtilization: 0.09,
        debug: false,
        automaticMaxConnections: true,
        maxConnections: 2
      })

      await client1.sconnect()

      expect(client1._maxConns.cache.total).toBe("100")
      expect(client1._maxConns.cache.updated > 0).toBeTruthy()

      await client1.end()
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
        port: 5432,
        connUtilization: 0.09,
        debug: false,
        strategy: "ranked"
      });
    });

    afterEach(async function() {
      await client.end()
    });

    it("should get process count without errors", async function() {
      const mockClients = await generateMockConnections(4)
      await client.sconnect()
      const result = await client._getProcessesCount();
      await cleanMockConnections(mockClients)

      expect(result).toBe("5")
    });

    it("should get list of processes count", async function() {
      const mockClients = await generateMockConnections(4)
      await client.sconnect()
      const result = await client._getIdleProcessesListOrderByDate();
      await cleanMockConnections(mockClients)

      expect(result).toHaveLength(4)
      expect(result.map(r => r.state)).toEqual(['idle', 'idle', 'idle', 'idle'])
    })

    it("should clean idle clients", async function() {
      await generateMockConnections(10)
      await client.sconnect()
      const result = await client.clean();

      expect(result).toHaveLength(10)
    })

    it("should not clean idle clients not enough clients connected", async function() {
      const mockClients = await generateMockConnections(4);
      await client.sconnect()
      const result = await client.clean();
      await cleanMockConnections(mockClients)

      expect(result).toBeUndefined()
    })
  });
});
