import { BaseResource } from '../core/base-resource.js';

/**
 * Resource: Connection profiles
 * URI pattern: db:///profiles
 */
export class ConnectionProfilesResource extends BaseResource {
  readonly uriTemplate = 'db:///profiles';
  readonly name = 'Connection Profiles';
  readonly description = 'Lists all available connection profiles (without credentials).';
  readonly mimeType = 'application/json';

  async getContent(_uri: string): Promise<string> {
    const profiles = this.connectionManager.getProfileNames();

    const result = {
      profiles: profiles.map((name) => ({
        name,
        uri: `db:///${name}/info`,
      })),
      count: profiles.length,
    };

    return JSON.stringify(result, null, 2);
  }
}
