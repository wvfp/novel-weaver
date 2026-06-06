import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import * as net from "node:net";
import { startServer, stop, getServerState } from "./server.js";
import { generateDashboard, regenerateDashboard } from "./generator.js";
import * as os from "node:os";

function getLanIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

export const novel_dashboard = tool({
  description: "管理小说项目 Dashboard 面板。支持生成、启动、停止、查看状态、重新生成。",
  args: {
    action: z.enum(["generate", "start", "stop", "status", "regenerate"]).describe("操作类型"),
    host: z.string().optional().describe("绑定地址，默认127.0.0.1，设为0.0.0.0可局域网访问"),
    port: z.number().optional().describe("端口号，默认3456"),
  },
  async execute(args, context) {
    const projectRoot = context.directory;
    const host = args.host || "127.0.0.1";
    const port = args.port || Number(process.env.NOVEL_DASHBOARD_PORT) || 3456;

    switch (args.action) {
      case "generate": {
        const result = await generateDashboard({ projectRoot, force: false });
        const info = await startServer(port, host, projectRoot);
        const lanIP = host === "0.0.0.0" ? getLanIP() : null;
        const urls = [`http://${host}:${info.port}`];
        if (lanIP) urls.push(`http://${lanIP}:${info.port}`);
        return {
          output: `Dashboard 已生成并启动。\n文件: ${result.path} (${result.size} bytes)\n访问: ${urls.join(" | ")}`,
        };
      }
      case "regenerate": {
        const result = await regenerateDashboard(projectRoot);
        const state = getServerState();
        if (!state.running) {
          await startServer(port, host, projectRoot);
        }
        return {
          output: `Dashboard 已重新生成。\n文件: ${result.path} (${result.size} bytes)\n刷新浏览器查看最新面板。`,
        };
      }
      case "start": {
        if (!(await isPortAvailable(port, host))) {
          const state = getServerState();
          if (state.running) {
            return { output: `Dashboard 已在运行: ${state.url}` };
          }
        }
        const info = await startServer(port, host, projectRoot);
        const lanIP = host === "0.0.0.0" ? getLanIP() : null;
        const urls = [info.url];
        if (lanIP) urls.push(`http://${lanIP}:${info.port}`);
        return { output: `Dashboard 已启动。\n访问: ${urls.join(" | ")}` };
      }
      case "stop": {
        await stop();
        return { output: "Dashboard 已停止。" };
      }
      case "status": {
        const state = getServerState();
        return {
          output: state.running
            ? `Dashboard 运行中\n端口: ${state.port}\n地址: ${state.url}`
            : "Dashboard 未运行。",
        };
      }
    }
  },
});
