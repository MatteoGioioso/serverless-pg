import EventEmitter = require("events");
import stream = require("stream");
import pg = require("pg");

declare interface TlsOptions {
  rejectUnauthorized?: boolean;
  ca?: string;
  key?: string;
  cert?: string;
}

declare interface Config {
  user?: string;
  database?: string;
  password?: string | (() => string | Promise<string>);
  port?: number;
  host?: string;
  connectionString?: string;
  allowCredentialsDiffing?: boolean;
  keepAlive?: boolean;
  stream?: stream.Duplex;
  statement_timeout?: false | number;
  parseInputDatesAsUTC?: boolean;
  ssl?: boolean | TlsOptions;
  query_timeout?: number;
  keepAliveInitialDelayMillis?: number;
  idle_in_transaction_session_timeout?: number;
  application_name?: string;
  connectionTimeoutMillis?: number;
  manualMaxConnections?: boolean;
  maxConnsFreqMs?: number;
  maxConnections?: number;
  processCountFreqMs?: number;
  processCountCacheEnabled?: boolean;
  strategy?: string;
  debug?: boolean;
  maxIdleConnectionsToKill?: number;
  minConnectionIdleTimeSec?: number;
  connUtilization?: number;
  capMs?: number;
  baseMs?: number;
  delayMs?: number;
  maxRetries?: number;
  library?: typeof import("pg").default;
  plugin?: Plugin;
}

declare interface Plugin {
  getIdleProcessesListByMinimumTimeout(self: ServerlessClient): Promise<NodePgClientResponse<ProcessList>>;

  getIdleProcessesListOrderByDate(self: ServerlessClient): Promise<NodePgClientResponse<ProcessList>>;

  processCount(self: ServerlessClient): Promise<NodePgClientResponse<Count>>;

  killProcesses(self: ServerlessClient, pids: string[]): Promise<NodePgClientResponse<any>>;

  showMaxConnections(self: ServerlessClient): Promise<NodePgClientResponse<MaxConnections>>;
}

declare interface ProcessList {
  pid: string;
}

declare interface Count {
  count: number;
}

declare interface MaxConnections {
  max_connections: number;
}

declare interface NodePgClientResponse<T> {
  rows: T[];
}

declare namespace ServerlessClient {
  export { TlsOptions, Config };
}

declare class ServerlessClient extends EventEmitter {
  constructor(config: Config)

  clean(): Promise<number | undefined>

  setConfig(config: Config): void

  connect(): Promise<void>

  query(...args): Promise<any>

  end(): Promise<any>

  on(event: "init", listener: (client: pg.Client) => void): this
}

export = ServerlessClient
