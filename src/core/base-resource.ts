import { ConnectionManager } from '../database/connection-manager.js';
import type { IDatabaseDriver } from '../database/interfaces/database-driver.js';

/**
 * Base class for all MCP resources
 * Provides structure and shared functionality for resource implementations
 */
export abstract class BaseResource {
  abstract readonly uriTemplate: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly mimeType: string;

  constructor(protected connectionManager: ConnectionManager) {}

  /**
   * Get the resource content
   */
  abstract getContent(uri: string): Promise<string>;

  /**
   * Get a database driver for the given profile
   */
  protected async getDriver(profile: string): Promise<IDatabaseDriver> {
    return this.connectionManager.getDriver(profile);
  }

  /**
   * Check if this resource matches a URI
   */
  matches(uri: string): boolean {
    const pattern = this.uriTemplate.replace(/\{[^}]+\}/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(uri);
  }

  /**
   * Extract parameters from URI based on template
   */
  protected extractParams(uri: string): Record<string, string> {
    const templateParts = this.uriTemplate.split('/');
    const uriParts = uri.split('/');
    const params: Record<string, string> = {};

    for (let i = 0; i < templateParts.length; i++) {
      const part = templateParts[i];
      if (part.startsWith('{') && part.endsWith('}')) {
        const paramName = part.slice(1, -1);
        params[paramName] = uriParts[i];
      }
    }

    return params;
  }

  /**
   * Get resource definition for MCP protocol
   */
  getDefinition(uri: string) {
    return {
      uri,
      name: this.name,
      description: this.description,
      mimeType: this.mimeType,
    };
  }
}
