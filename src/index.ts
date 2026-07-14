#!/usr/bin/env node

import { ConfigLoader } from './config/config-loader.js';
import { SqlServerMcpServer } from './server.js';

/**
 * Main entry point for SQL Server MCP Server
 */
async function main() {
  try {
    // Load configuration
    const config = ConfigLoader.load();
    ConfigLoader.validate(config);

    // Create and start server
    const server = new SqlServerMcpServer(config);

    // Handle shutdown signals. Guard against re-entrancy (a second signal while
    // shutting down) and force-exit if graceful close hangs.
    let shuttingDown = false;
    const shutdown = async (code = 0) => {
      if (shuttingDown) return;
      shuttingDown = true;

      const forceExit = setTimeout(() => process.exit(code), 5000);
      forceExit.unref();

      try {
        await server.shutdown();
      } catch (error) {
        console.error('Error during shutdown:', error);
      } finally {
        process.exit(code);
      }
    };

    process.on('SIGINT', () => void shutdown(0));
    process.on('SIGTERM', () => void shutdown(0));

    // A stray async rejection or throw must not leave a half-open server; log and
    // shut down cleanly.
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      void shutdown(1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      void shutdown(1);
    });

    // Start server
    await server.start();
  } catch (error) {
    console.error('Failed to start SQL Server MCP Server:', error);
    process.exit(1);
  }
}

void main();
