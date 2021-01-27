import stream = require('stream');

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
  manualMaxConnections?: number;
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
}

declare class ServerlessClient {
  constructor(config: Config)
  clean(): Promise<number | undefined>
  setConfig(config: Config): void
  connect(): Promise<void>
  query(...args): Promise<any>
  end(): Promise<any>
  on(...args): void
}

export = ServerlessClient
