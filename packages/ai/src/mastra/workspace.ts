import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
} from "@mastra/core/workspace";
import { env } from "../env";

export const smotixWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: env.WORKSPACE_PATH,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: env.WORKSPACE_PATH,
    timeout: 30000, // 30 seconds
  }),
  skills: ["/skills"],
});
