import { BaseResource } from './base-resource.js';

/**
 * Registry for managing MCP resources
 */
export class ResourceRegistry {
  private resources: BaseResource[] = [];

  /**
   * Register a resource
   */
  register(resource: BaseResource): void {
    this.resources.push(resource);
  }

  /**
   * Find a resource that matches a URI
   */
  find(uri: string): BaseResource | undefined {
    return this.resources.find((resource) => resource.matches(uri));
  }

  /**
   * Get all registered resources
   */
  getAll(): BaseResource[] {
    return [...this.resources];
  }

  /**
   * Get all resource URIs (with templates expanded for listing)
   */
  getUris(): string[] {
    return this.resources.map((resource) => resource.uriTemplate);
  }
}
