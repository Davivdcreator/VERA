import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { spawn } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rebuildCostScript = fileURLToPath(new URL("./src/feature-scripts/rebuild_cost_agent.py", import.meta.url));
const advisoryScript = fileURLToPath(new URL("./src/feature-scripts/advisory_agent.py", import.meta.url));

type RebuildCostRequest = {
  prompt?: unknown;
  target?: unknown;
  currency?: unknown;
  basisDate?: unknown;
  agent?: unknown;
  timeout?: unknown;
};

type AdvisoryRequest = {
  prompt?: unknown;
  objective?: unknown;
  databaseRoot?: unknown;
  catalogs?: unknown;
  agent?: unknown;
  timeout?: unknown;
};

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function writeJson(res: import("node:http").ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildRebuildCostArgs(body: RebuildCostRequest): string[] {
  const prompt = optionalString(body.prompt);
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const args = [rebuildCostScript, "--prompt", prompt];
  const target = optionalString(body.target);
  const currency = optionalString(body.currency);
  const basisDate = optionalString(body.basisDate);
  const agent = optionalString(body.agent);

  if (target) args.push("--target", target);
  if (currency) args.push("--currency", currency);
  if (basisDate) args.push("--basis-date", basisDate);
  if (agent) {
    if (!["auto", "claude", "codex", "cursor"].includes(agent)) {
      throw new Error("agent must be one of: auto, claude, codex, cursor.");
    }
    args.push("--agent", agent);
  }

  if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
    args.push("--timeout", String(Math.min(Math.max(Math.trunc(body.timeout), 5), 600)));
  }

  return args;
}

function buildAdvisoryArgs(body: AdvisoryRequest): string[] {
  const prompt = optionalString(body.prompt);
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const args = [advisoryScript, "--prompt", prompt];
  const objective = optionalString(body.objective);
  const databaseRoot = optionalString(body.databaseRoot);
  const agent = optionalString(body.agent);

  if (objective) args.push("--objective", objective);
  if (databaseRoot) args.push("--database-root", databaseRoot);
  if (Array.isArray(body.catalogs)) {
    for (const catalog of body.catalogs) {
      const value = optionalString(catalog);
      if (value) args.push("--catalog", value);
    }
  }
  if (agent) {
    if (!["auto", "claude", "codex", "cursor"].includes(agent)) {
      throw new Error("agent must be one of: auto, claude, codex, cursor.");
    }
    args.push("--agent", agent);
  }

  if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
    args.push("--timeout", String(Math.min(Math.max(Math.trunc(body.timeout), 5), 900)));
  }

  return args;
}

function isRebuildCostRequest(value: unknown): value is RebuildCostRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdvisoryRequest(value: unknown): value is AdvisoryRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runPythonJsonEndpoint(
  res: import("node:http").ServerResponse,
  args: string[],
  failureMessage: string,
  invalidJsonMessage: string,
) {
  const child = spawn("python3", args, {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let responded = false;
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("error", (error) => {
    responded = true;
    writeJson(res, 500, { error: error.message });
  });

  child.on("close", (code) => {
    if (responded) return;

    if (code !== 0) {
      writeJson(res, 500, {
        error: failureMessage,
        detail: stderr.trim() || stdout.trim(),
      });
      return;
    }

    try {
      writeJson(res, 200, JSON.parse(stdout));
    } catch {
      writeJson(res, 500, {
        error: invalidJsonMessage,
        detail: stdout.trim(),
      });
    }
  });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "rebuild-cost-api",
      configureServer(server) {
        server.middlewares.use("/api/rebuild-cost", async (req, res) => {
          if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            writeJson(res, 405, { error: "Method not allowed." });
            return;
          }

          try {
            const body = await readJsonBody(req);
            if (!isRebuildCostRequest(body)) {
              throw new Error("Request body must be a JSON object.");
            }

            const args = buildRebuildCostArgs(body);
            runPythonJsonEndpoint(
              res,
              args,
              "Rebuild cost calculation failed.",
              "Rebuild cost script returned invalid JSON.",
            );
          } catch (error) {
            writeJson(res, 400, { error: error instanceof Error ? error.message : "Bad request." });
          }
        });

        server.middlewares.use("/api/advisory", async (req, res) => {
          if (req.method !== "POST") {
            res.setHeader("Allow", "POST");
            writeJson(res, 405, { error: "Method not allowed." });
            return;
          }

          try {
            const body = await readJsonBody(req);
            if (!isAdvisoryRequest(body)) {
              throw new Error("Request body must be a JSON object.");
            }

            const args = buildAdvisoryArgs(body);
            runPythonJsonEndpoint(
              res,
              args,
              "Advisory calculation failed.",
              "Advisory script returned invalid JSON.",
            );
          } catch (error) {
            writeJson(res, 400, { error: error instanceof Error ? error.message : "Bad request." });
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
