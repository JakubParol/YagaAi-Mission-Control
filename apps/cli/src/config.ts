export interface Config {
  apiUrl: string;
  jsonOutput: boolean;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiUrl: overrides.apiUrl ?? process.env.MC_API_URL ?? "http://localhost:5001",
    jsonOutput: overrides.jsonOutput ?? false,
  };
}
