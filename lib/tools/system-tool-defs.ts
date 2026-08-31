import { Tool } from "./types";
import { runCommand, readFile, writeFile, listDirectory, openApplication, getSystemInfo, takeDesktopScreenshot, listProcesses } from "./system";

export const SYSTEM_TOOLS: Tool[] = [
  {
    schema: {
      name: "run_command",
      description: "执行命令行指令。仅允许白名单内的安全命令（node、npm、npx、git、python、pip、ls/dir、cat/type、echo、tasklist、ipconfig、ping 等查看与开发工具类）。删除、关机、注册表、下载执行等危险命令会被自动拦截。命令有 30 秒超时。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令行指令。Windows 下可用 dir、type、echo 等命令。",
          },
        },
        required: ["command"],
      },
    },
    handler: async (args: Record<string, any>) => {
      const result = await runCommand(args.command);
      return result;
    },
  },
  {
    schema: {
      name: "read_file",
      description: "读取本地文件的内容。支持文本文件。禁止读取系统目录或敏感文件（如 C:\\Windows 等）。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的完整路径或相对路径。例如：data/models.json 或 C:\\Users\\name\\file.txt",
          },
        },
        required: ["path"],
      },
    },
    handler: async (args: Record<string, any>) => {
      return await readFile(args.path);
    },
  },
  {
    schema: {
      name: "write_file",
      description: "将内容写入本地文件。如果文件不存在会自动创建，父目录不存在也会自动创建。禁止写入系统目录。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的完整路径或相对路径。",
          },
          content: {
            type: "string",
            description: "要写入的文本内容。",
          },
        },
        required: ["path", "content"],
      },
    },
    handler: async (args: Record<string, any>) => {
      return await writeFile(args.path, args.content);
    },
  },
  {
    schema: {
      name: "list_directory",
      description: "列出指定目录下的文件和子目录。禁止操作系统目录。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录路径，可使用相对路径（如 . 表示当前目录）或绝对路径。",
          },
        },
        required: ["path"],
      },
    },
    handler: async (args: Record<string, any>) => {
      return await listDirectory(args.path);
    },
  },
  {
    schema: {
      name: "open_application",
      description: "打开本地应用程序。可以传入应用名称（如 notepad、calc、chrome、msedge）或可执行文件的完整路径。",
      parameters: {
        type: "object",
        properties: {
          appName: {
            type: "string",
            description: "应用名称或可执行文件路径。例如：notepad、calc、msedge、code",
          },
        },
        required: ["appName"],
      },
    },
    handler: async (args: Record<string, any>) => {
      return await openApplication(args.appName);
    },
  },
  {
    schema: {
      name: "system_info",
      description: "获取电脑的系统信息，包括操作系统、CPU、内存、运行时间等。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async () => {
      return await getSystemInfo();
    },
  },
  {
    schema: {
      name: "take_desktop_screenshot",
      description: "截取当前电脑屏幕的画面。截图会保存到服务器并可查看。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async () => {
      const result = await takeDesktopScreenshot();
      return JSON.stringify(result);
    },
  },
  {
    schema: {
      name: "list_processes",
      description: "列出当前正在运行的前 50 个进程。",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async () => {
      return await listProcesses();
    },
  },
];
