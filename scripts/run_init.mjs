/**
 * Invoke novelInitTool.execute() via the plugin hooks
 *
 * Since novelInitTool is not directly exported from the dist bundle,
 * we call the exported server() function, grab the tool from the
 * returned hooks, and execute it with the required ToolContext.
 */
import { server } from "../dist/index.js";

async function main() {
  // 1. Get the plugin hooks
  const hooks = await server({}, {});

  // 2. Grab the novel_init tool definition
  const initTool = hooks.tool?.novel_init;
  if (!initTool) {
    console.error("ERROR: novel_init tool not found in plugin hooks");
    process.exit(1);
  }

  // 3. Build a minimal ToolContext
  //    We use process.cwd() (the project root) as the "directory".
  const context = {
    sessionID: "cli-init",
    messageID: "msg-001",
    agent: "novel-weaver-cli",
    directory: process.cwd(),
    worktree: process.cwd(),
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  };

  // 4. Call execute with the user's parameters
  const result = await initTool.execute(
    {
      project_name: "诸天模拟器：我能抽取金手指",
      genre: "infinite-flow",
      author: "柒柒",
    },
    context,
  );

  // 5. Print the result
  if (typeof result === "string") {
    console.log(result);
  } else {
    console.log(result.output);
    if (result.metadata) {
      console.log("\nMetadata:", JSON.stringify(result.metadata, null, 2));
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
