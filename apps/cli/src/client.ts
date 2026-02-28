import axios, { AxiosInstance, AxiosError } from "axios";
import chalk from "chalk";
import { Config } from "./config";

export interface ApiEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

export class ApiClient {
  private http: AxiosInstance;

  constructor(config: Config) {
    this.http = axios.create({
      baseURL: config.apiUrl,
      timeout: 10000,
      headers: { "Content-Type": "application/json" },
    });

    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.data?.error) {
          const apiErr = error.response.data.error;
          const msg = `${chalk.red("API Error")} [${apiErr.code}]: ${apiErr.message}`;
          if (apiErr.details?.length) {
            const details = apiErr.details
              .map((d) => `  - ${d.field ? `${d.field}: ` : ""}${d.message}`)
              .join("\n");
            console.error(`${msg}\n${details}`);
          } else {
            console.error(msg);
          }
        } else if (error.code === "ECONNREFUSED") {
          console.error(
            chalk.red("Connection refused."),
            `Is the API running at ${error.config?.baseURL}?`
          );
        } else {
          console.error(chalk.red("Request failed:"), error.message);
        }
        process.exit(1);
      }
    );
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const resp = await this.http.get<T>(path, { params });
    return resp.data;
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const resp = await this.http.post<T>(path, data);
    return resp.data;
  }

  async patch<T>(path: string, data?: unknown): Promise<T> {
    const resp = await this.http.patch<T>(path, data);
    return resp.data;
  }

  async delete(path: string): Promise<void> {
    await this.http.delete(path);
  }
}
