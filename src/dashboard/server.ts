import express from "express";
import cors from "cors";
import compression from "compression";
import * as http from "node:http";
import * as url from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import { apiRouter } from "./api.js";
import { initModelResolver, getModelResolver } from "../services/model-resolver.js";

let server: http.Server | null = null;
let runningPort = 0;
let runningHost = "127.0.0.1";
let sigHandlers: (() => void)[] = [];

export interface ServerInfo {
  port: number;
  url: string;
  host: string;
  stop: () => Promise<void>;
}

export async function startServer(
  port = Number(process.env.NOVEL_DASHBOARD_PORT) || 3456,
  host = "127.0.0.1",
  projectRoot = process.cwd(),
): Promise<ServerInfo> {
  if (server) {
    return { port: runningPort, url: `http://${runningHost}:${runningPort}`, host: runningHost, stop };
  }

  // Ensure the ModelResolver singleton is bound to this project root so
  // /api/config endpoints can serve live resolutions. Best-effort: a
  // missing config file should not block server startup.
  try {
    try {
      await getModelResolver().init();
    } catch {
      await initModelResolver(projectRoot).init();
    }
  } catch (err) {
    console.warn(
      `[novel-weaver] Dashboard: failed to initialise ModelResolver: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const app = express();

  app.use(cors({ origin: `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`, credentials: false }));
  app.use(compression());
  app.use(express.json({ limit: "10kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  app.use("/api", apiRouter(projectRoot));

  // ── Static file serving from web/dist ────────────────────────────────
  const thisDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(url.fileURLToPath(import.meta.url));
  const webDist = path.resolve(thisDir, "../../web/dist");
  const webDistExists = fs.existsSync(webDist);

  if (webDistExists) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else {
    // Legacy: serve from .novel-weaver/dashboard if web/dist is absent
    const dashDir = path.join(projectRoot, ".novel-weaver", "dashboard");
    if (fs.existsSync(dashDir)) {
      app.use(express.static(dashDir));
    }

    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      const indexPath = path.join(dashDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).json({ error: "前端未构建，请运行 npm run web:build" });
      }
    });
  }

  return new Promise((resolve, reject) => {
    const srv = app.listen(port, host, () => {
      const addr = srv.address();
      runningPort = typeof addr === "object" && addr ? addr.port : port;
      runningHost = host;
      server = srv;

      const onSigTerm = () => { stop().then(() => process.exit(0)); };
      sigHandlers = [onSigTerm];
      process.once("SIGTERM", onSigTerm);
      process.once("SIGINT", onSigTerm);

      resolve({ port: runningPort, url: `http://${host}:${runningPort}`, host, stop });
    });

    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        srv.listen(0, host);
        return;
      }
      reject(err);
    });
  });
}

export async function stop(): Promise<void> {
  if (!server) return;
  return new Promise((resolve) => {
    server!.close(() => {
      for (const h of sigHandlers) {
        process.removeListener("SIGTERM", h);
        process.removeListener("SIGINT", h);
      }
      sigHandlers = [];
      server = null;
      runningPort = 0;
      resolve();
    });
  });
}

export function getServerState(): { running: boolean; port: number; url: string; host: string } {
  if (!server) return { running: false, port: 0, url: "", host: "" };
  return { running: true, port: runningPort, url: `http://${runningHost}:${runningPort}`, host: runningHost };
}
