"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "./theme-context";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface CharacterInfo {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

interface ModelInfo {
  id: string;
  name: string;
  model: string;
  baseURL: string;
  embeddingModel: string | null;
  hasApiKey: boolean;
}

interface AgentState {
  mood: number;
  affection: number;
  trust: number;
  plotStage: string;
  energy: number;
  openness: number;
  dominance: number;
}

interface CharacterForm {
  name: string;
  role: string;
  personality: string;
  background: string;
  speakingStyle: string;
  scene: string;
  avatar: string; // emoji 或图片 URL
  avatarType: "emoji" | "image";
  rules: string[];
  lore: string[];
}

interface CharacterTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

interface ModelForm {
  name: string;
  baseURL: string;
  model: string;
  embeddingModel: string;
  apiKey: string;
}

const DEFAULT_CHARACTER_FORM: CharacterForm = {
  name: "",
  role: "",
  personality: "",
  background: "",
  speakingStyle: "",
  scene: "",
  avatar: "🎭",
  avatarType: "emoji",
  rules: [
    "始终以该角色身份回复，绝不暴露自己是 AI",
    "不要直接重复用户的话",
    "回复控制在 2-6 句话",
    "可以适当加入动作描写，用括号括起来",
  ],
  lore: ["", ""],
};

const DEFAULT_MODEL_FORM: ModelForm = {
  name: "",
  baseURL: "",
  model: "",
  embeddingModel: "",
  apiKey: "",
};

// 常见服务商预设（点一下自动填好 Base URL + 模型 ID，省得手填出错）
const MODEL_PRESETS: { label: string; baseURL: string; model: string; embeddingModel?: string }[] = [
  { label: "Kimi", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", embeddingModel: "moonshot-v1-embedding" },
  { label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo", embeddingModel: "text-embedding-v2" },
  { label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "Ollama(本地)", baseURL: "http://localhost:11434/v1", model: "llama3" },
];

export default function ChatPage() {
  const { theme, toggleTheme } = useTheme();

  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [currentCharacter, setCurrentCharacter] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stateInfo, setStateInfo] = useState<AgentState | null>(null);
  const [understandingInfo, setUnderstandingInfo] = useState<any>(null);
  const [plotInfo, setPlotInfo] = useState<any>(null);
  const [toolCallsInfo, setToolCallsInfo] = useState<any[]>([]);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");

  // 角色弹窗
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [charForm, setCharForm] = useState<CharacterForm>(DEFAULT_CHARACTER_FORM);
  const [savingCharacter, setSavingCharacter] = useState(false);

  // 模型弹窗
  const [showModelModal, setShowModelModal] = useState(false);
  const [modelForm, setModelForm] = useState<ModelForm>(DEFAULT_MODEL_FORM);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  // 工具配置 / 审批 / 用量
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [toolsConfig, setToolsConfig] = useState<{
    tools: { name: string; description: string; category: string; highRisk: boolean; enabled: boolean }[];
    settings: { approvalMode: string; maxIterations: number; maxTokens: number; toolTimeoutMs: number };
  } | null>(null);
  const [savingTools, setSavingTools] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    characterId: string;
    toolCalls: { name: string; args: any }[];
  } | null>(null);
  const [usage, setUsage] = useState<{
    total: { promptTokens: number; completionTokens: number; calls: number };
  } | null>(null);

  // MCP 服务器 / 插件
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [mcpForm, setMcpForm] = useState<{
    id?: string;
    name: string;
    transport: string;
    command: string;
    args: string;
    url: string;
    env: string;
  }>({ name: "", transport: "stdio", command: "", args: "", url: "", env: "" });
  const [mcpTesting, setMcpTesting] = useState<string | null>(null);
  const [pluginList, setPluginList] = useState<any[]>([]);
  const [dynamicErrors, setDynamicErrors] = useState<any[]>([]);

  // 导入导出弹窗
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 角色模板
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);

  // 头像上传
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // 加载角色列表
  const loadCharacters = useCallback(async () => {
    try {
      const res = await fetch("/api/characters");
      const data = await res.json();
      if (data.characters) {
        setCharacters(data.characters);
        if (data.characters.length > 0 && !currentCharacter) {
          setCurrentCharacter(data.characters[0].id);
        }
      }
    } catch (err) {
      console.error("加载角色失败:", err);
    }
  }, [currentCharacter]);

  // 加载模型列表
  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        setCurrentModel(data.current);
      }
    } catch (err) {
      console.error("加载模型失败:", err);
    }
  }, []);

  // 加载角色模板
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/characters/templates");
      const data = await res.json();
      if (data.templates) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error("加载模板失败:", err);
    }
  }, []);

  useEffect(() => {
    loadCharacters();
    loadModels();
    loadTemplates();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentCharacter]);

  // ===== 提醒系统：轮询到期提醒并弹窗通知 =====
  const [reminderToasts, setReminderToasts] = useState<
    Array<{ id: string; content: string; timeText: string; dueAt: string }>
  >([]);
  const [upcomingReminders, setUpcomingReminders] = useState<
    Array<{ id: string; content: string; timeText: string; dueAt: string }>
  >([]);
  const seenReminderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const pollReminders = async () => {
      try {
        const res = await fetch("/api/reminders");
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;
        setUpcomingReminders(data.upcoming || []);

        // 弹出到期提醒（只弹没见过的，避免重复）
        const fresh = (data.triggered || []).filter(
          (t: any) => !seenReminderIds.current.has(t.id)
        );
        if (fresh.length > 0) {
          for (const t of fresh) seenReminderIds.current.add(t.id);
          setReminderToasts((prev) => [...prev, ...fresh.slice(0, 5)]);
          // 15 秒后自动消失
          for (const t of fresh) {
            setTimeout(() => {
              setReminderToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, 15000);
          }
        }
      } catch {
        // 网络异常时静默重试
      }
    };

    pollReminders();
    const timer = setInterval(pollReminders, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const currentMessages = messages[currentCharacter] || [];

  const switchCharacter = (id: string) => {
    setCurrentCharacter(id);
    setStateInfo(null);
    setUnderstandingInfo(null);
    setPlotInfo(null);
    // 加载该角色的历史对话
    loadChatHistoryForCharacter(id);
  };

  // 加载角色的历史对话
  const loadChatHistoryForCharacter = async (characterId: string) => {
    try {
      const res = await fetch(`/api/chat/history?characterId=${characterId}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages((prev) => ({
          ...prev,
          [characterId]: data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
        }));
      }
    } catch (err) {
      console.error("加载历史对话失败:", err);
    }
  };

  // 导出对话
  const exportChat = async (format: "json" | "markdown") => {
    if (!currentCharacter) return;
    try {
      const res = await fetch(`/api/chat/export?characterId=${currentCharacter}&format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const char = characters.find((c) => c.id === currentCharacter);
        const filename = `chat-${char?.name || "unknown"}-${Date.now()}.${format === "json" ? "json" : "md"}`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setShowExportModal(false);
      } else {
        const data = await res.json();
        alert("导出失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("导出失败：" + err.message);
    }
  };

  // 导出所有对话
  const exportAllChats = async () => {
    try {
      const res = await fetch("/api/chat/export?all=true");
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `all-chats-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setShowExportModal(false);
      } else {
        const data = await res.json();
        alert("导出失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("导出失败：" + err.message);
    }
  };

  // 导入对话
  const importChat = async (file: File, mode: "single" | "all" = "single") => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);

      const res = await fetch("/api/chat/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setShowImportModal(false);
        // 刷新当前角色的对话
        if (currentCharacter && mode === "single") {
          loadChatHistoryForCharacter(currentCharacter);
        } else if (mode === "all") {
          // 重新加载所有角色列表
          loadCharacters();
        }
      } else {
        alert("导入失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("导入失败：" + err.message);
    } finally {
      setImporting(false);
    }
  };

  // 清空当前对话
  const clearCurrentChat = async () => {
    if (!currentCharacter) return;
    if (!confirm("确定要清空当前对话历史吗？此操作不可恢复。")) return;

    try {
      const res = await fetch(`/api/chat/history?characterId=${currentCharacter}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessages((prev) => ({ ...prev, [currentCharacter]: [] }));
        alert("对话历史已清空");
      } else {
        const data = await res.json();
        alert("清空失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("清空失败：" + err.message);
    }
  };

  function getToolLabel(name: string): string {
    const labels: Record<string, string> = {
      get_weather: "查询天气",
      web_search: "搜索网页",
      set_reminder: "设置提醒",
      calculate: "计算",
      get_current_time: "获取时间",
      browse_webpage: "浏览网页",
      search_webpage: "网页搜索",
      screenshot_webpage: "网页截图",
      run_command: "执行命令",
      read_file: "读取文件",
      write_file: "写入文件",
      list_directory: "列出目录",
      open_application: "打开应用",
      system_info: "系统信息",
      take_desktop_screenshot: "桌面截图",
      list_processes: "列出进程",
    };
    return labels[name] || name;
  }

  const switchModel = async (modelId: string) => {
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: modelId }),
      });
      if (res.ok) {
        setCurrentModel(modelId);
      }
    } catch (err) {
      console.error("切换模型失败:", err);
    }
  };

  // 统一的 SSE 流消费：/api/chat/stream 与 /api/chat/approve 共用
  async function consumeChatStream(res: Response, characterId: string) {
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "服务器错误" }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取响应");

    const decoder = new TextDecoder();
    let buffer = "";
    let assistantReply = "";

    setMessages((prev) => ({
      ...prev,
      [characterId]: [
        ...(prev[characterId] || []),
        { role: "assistant", content: "", streaming: true },
      ],
    }));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const dataLine = line.trim();
        if (!dataLine.startsWith("data: ")) continue;

        const jsonStr = dataLine.slice(6);
        try {
          const chunk = JSON.parse(jsonStr);

          if (chunk.type === "token") {
            assistantReply += chunk.data;
            setMessages((prev) => {
              const msgs = [...(prev[characterId] || [])];
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                lastMsg.content = assistantReply;
              }
              return { ...prev, [characterId]: msgs };
            });
          } else if (chunk.type === "state") {
            setStateInfo(chunk.data.state);
            setUnderstandingInfo(chunk.data.understanding);
          } else if (chunk.type === "plot") {
            setPlotInfo(chunk.data);
          } else if (chunk.type === "tool_call") {
            setToolCallsInfo((prev) => {
              const idx = prev.findIndex(
                (t) => t.name === chunk.data.name && t.status === "calling"
              );
              if (idx >= 0) {
                return prev.map((t, i) => (i === idx ? { ...t, ...chunk.data } : t));
              }
              return [...prev, chunk.data];
            });
          } else if (chunk.type === "tool_approval") {
            // 高危工具等待人工批准
            setPendingApproval(chunk.data);
          } else if (chunk.type === "revision") {
            // 后处理改写了回复，替换已显示的内容
            assistantReply = chunk.data;
            setMessages((prev) => {
              const msgs = [...(prev[characterId] || [])];
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                lastMsg.content = assistantReply;
              }
              return { ...prev, [characterId]: msgs };
            });
          } else if (chunk.type === "done") {
            setStateInfo(chunk.data.state);
            setUnderstandingInfo(chunk.data.understanding);
            if (chunk.data.plotEvent) {
              setPlotInfo(chunk.data.plotEvent);
            }
            if (chunk.data.usage) {
              setUsage({ total: chunk.data.usage });
            }
            setMessages((prev) => {
              const msgs = [...(prev[characterId] || [])];
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg) lastMsg.streaming = false;
              return { ...prev, [characterId]: msgs };
            });
            // 审批期间保留工具提示，其余 3 秒后清除
            if (!chunk.data.pendingApproval) {
              setTimeout(() => setToolCallsInfo([]), 3000);
            }
          } else if (chunk.type === "error") {
            setMessages((prev) => ({
              ...prev,
              [characterId]: [
                ...(prev[characterId] || []),
                { role: "assistant", content: `（错误：${chunk.data}）` },
              ],
            }));
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading || !currentCharacter) return;

    const userMsg = input.trim();
    setInput("");

    setMessages((prev) => ({
      ...prev,
      [currentCharacter]: [
        ...(prev[currentCharacter] || []),
        { role: "user", content: userMsg },
      ],
    }));

    setLoading(true);
    setToolCallsInfo([]);
    setPendingApproval(null);

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, characterId: currentCharacter }),
      });
      await consumeChatStream(res, currentCharacter);
    } catch (err: any) {
      setMessages((prev) => ({
        ...prev,
        [currentCharacter]: [
          ...(prev[currentCharacter] || []),
          { role: "assistant", content: "（网络出了点问题，请稍后再试）" },
        ],
      }));
    } finally {
      setLoading(false);
    }
  }

  // 工具审批：批准 / 拒绝后恢复对话
  async function handleApproval(approved: boolean) {
    if (!pendingApproval || loading) return;
    const characterId = pendingApproval.characterId;
    setPendingApproval(null);
    setLoading(true);
    setToolCallsInfo([]);
    try {
      const res = await fetch("/api/chat/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, approved }),
      });
      await consumeChatStream(res, characterId);
    } catch (err: any) {
      setMessages((prev) => ({
        ...prev,
        [characterId]: [
          ...(prev[characterId] || []),
          { role: "assistant", content: `（审批请求失败：${err.message}）` },
        ],
      }));
    } finally {
      setLoading(false);
    }
  }

  // 加载工具配置
  async function loadToolsConfig() {
    try {
      const res = await fetch("/api/tools");
      if (res.ok) {
        const data = await res.json();
        setToolsConfig(data);
        setDynamicErrors(data.dynamicErrors || []);
      }
    } catch (err) {
      console.error("加载工具配置失败:", err);
    }
  }

  // 单个工具开关
  function toggleToolEnabled(name: string) {
    setToolsConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tools: prev.tools.map((t) =>
          t.name === name ? { ...t, enabled: !t.enabled } : t
        ),
      };
    });
  }

  // 保存工具配置（开关 + 审批模式 + Agent 参数）
  async function saveToolsSettings() {
    if (!toolsConfig) return;
    setSavingTools(true);
    try {
      const enabled: Record<string, boolean> = {};
      for (const t of toolsConfig.tools) {
        enabled[t.name] = t.enabled;
      }
      const res = await fetch("/api/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          approvalMode: toolsConfig.settings.approvalMode,
          maxIterations: toolsConfig.settings.maxIterations,
          maxTokens: toolsConfig.settings.maxTokens,
          toolTimeoutMs: toolsConfig.settings.toolTimeoutMs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setToolsConfig((prev) => (prev ? { ...prev, settings: data.settings } : prev));
        setShowToolsModal(false);
      }
    } catch (err) {
      console.error("保存工具配置失败:", err);
    } finally {
      setSavingTools(false);
    }
  }

  // 用量统计
  async function loadUsage() {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        setUsage(await res.json());
      }
    } catch {
      // ignore
    }
  }

  // MCP 服务器
  async function loadMcpServers() {
    setMcpLoading(true);
    try {
      const res = await fetch("/api/mcp");
      if (res.ok) {
        const data = await res.json();
        setMcpServers(data.servers || []);
      }
    } catch (err) {
      console.error("加载 MCP 服务器失败:", err);
    } finally {
      setMcpLoading(false);
    }
  }

  async function saveMcpServer() {
    const body: any = {
      action: mcpForm.id ? "update" : "add",
      name: mcpForm.name,
      transport: mcpForm.transport,
    };
    if (mcpForm.id) body.id = mcpForm.id;
    if (mcpForm.transport === "stdio") {
      body.command = mcpForm.command;
      if (mcpForm.args.trim()) body.args = mcpForm.args.split(/\s+/).filter(Boolean);
    } else {
      body.url = mcpForm.url;
    }
    if (mcpForm.env.trim()) {
      try {
        body.env = JSON.parse(mcpForm.env);
      } catch {
        alert("环境变量 JSON 格式错误");
        return;
      }
    }
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMcpForm({ name: "", transport: "stdio", command: "", args: "", url: "", env: "" });
        setShowMcpForm(false);
        loadMcpServers();
        loadToolsConfig();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "保存失败");
      }
    } catch (err) {
      console.error("保存 MCP 服务器失败:", err);
    }
  }

  async function toggleMcp(id: string, enabled: boolean) {
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id, enabled }),
      });
      if (res.ok) {
        loadMcpServers();
        loadToolsConfig();
      }
    } catch (err) {
      console.error("切换 MCP 服务器失败:", err);
    }
  }

  async function deleteMcp(id: string) {
    if (!confirm("确定删除该 MCP 服务器？")) return;
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      if (res.ok) {
        loadMcpServers();
        loadToolsConfig();
      }
    } catch (err) {
      console.error("删除 MCP 服务器失败:", err);
    }
  }

  async function testMcp(server: any) {
    setMcpTesting(server.id);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: server.id }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`连接成功，发现 ${data.tools.length} 个工具: ${data.tools.join(", ")}`);
      } else {
        alert(`连接失败: ${data.error}`);
      }
    } catch (err) {
      alert("测试请求失败");
    } finally {
      setMcpTesting(null);
    }
  }

  // 插件列表
  async function loadPlugins() {
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const data = await res.json();
        setPluginList(data.plugins || []);
      }
    } catch (err) {
      console.error("加载插件失败:", err);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ========== 角色管理 ==========

  function openCreateCharacterModal() {
    setEditingCharacter(null);
    setCharForm(DEFAULT_CHARACTER_FORM);
    setAvatarPreview("");
    setAvatarFile(null);
    setShowCharacterModal(true);
  }

  // 编辑已有角色
  async function openEditCharacter(id: string) {
    try {
      const res = await fetch(`/api/characters?id=${id}`);
      const data = await res.json();
      if (data.character) {
        const char = data.character;
        setEditingCharacter(id);
        setCharForm({
          name: char.name || "",
          role: char.role || "",
          personality: char.personality || "",
          background: char.background || "",
          speakingStyle: char.speakingStyle || "",
          scene: char.scene || "",
          avatar: char.avatar || "🎭",
          avatarType: char.avatar && char.avatar.startsWith("/") ? "image" : "emoji",
          rules: char.rules || DEFAULT_CHARACTER_FORM.rules,
          lore: char.lore && char.lore.length > 0 ? char.lore : ["", ""],
        });
        setAvatarPreview(char.avatar && char.avatar.startsWith("/") ? char.avatar : "");
        setAvatarFile(null);
        setShowCharacterModal(true);
      } else {
        alert("加载角色失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("加载角色失败：" + err.message);
    }
  }

  // 应用角色模板
  async function applyTemplate(templateId: string) {
    try {
      const res = await fetch(`/api/characters/templates`);
      const data = await res.json();
      const template = data.templates?.find((t: any) => t.id === templateId);
      if (template && template.character) {
        setCharForm({
          name: template.character.name,
          role: template.character.role,
          personality: template.character.personality,
          background: template.character.background,
          speakingStyle: template.character.speakingStyle,
          scene: template.character.scene,
          avatar: template.emoji || "🎭",
          avatarType: "emoji",
          rules: template.character.rules || DEFAULT_CHARACTER_FORM.rules,
          lore: template.character.lore || ["", ""],
        });
        setAvatarPreview("");
        setAvatarFile(null);
      }
    } catch (err) {
      console.error("应用模板失败:", err);
    }
  }

  // 处理头像文件选择
  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("图片大小不能超过 2MB");
      return;
    }
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    setCharForm((prev) => ({ ...prev, avatarType: "image" }));
  }

  // 切换头像类型
  function switchAvatarType(type: "emoji" | "image") {
    setCharForm((prev) => ({ ...prev, avatarType: type }));
    if (type === "emoji") {
      setAvatarPreview("");
      setAvatarFile(null);
    }
  }

  async function saveCharacterForm() {
    setSavingCharacter(true);
    try {
      const id = editingCharacter || formToId(charForm.name);
      let avatar = charForm.avatar;

      // 如果有头像文件，先上传
      if (avatarFile && charForm.avatarType === "image") {
        const formData = new FormData();
        formData.append("file", avatarFile);
        formData.append("characterId", id);
        const uploadRes = await fetch("/api/characters/avatar", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          avatar = uploadData.avatarUrl;
        }
      }

      // 如果是编辑模式，先加载原有角色保留 initialState
      let initialState = undefined;
      if (editingCharacter) {
        try {
          const loadRes = await fetch(`/api/characters?id=${editingCharacter}`);
          const loadData = await loadRes.json();
          if (loadData.character) {
            initialState = loadData.character.initialState;
          }
        } catch {}
      }

      const character = {
        name: charForm.name,
        role: charForm.role,
        personality: charForm.personality,
        background: charForm.background,
        speakingStyle: charForm.speakingStyle,
        scene: charForm.scene,
        avatar,
        initialState: initialState || {
          mood: 0,
          affection: 0,
          trust: 0,
          plotStage: "初识",
          energy: 50,
          openness: 0,
          dominance: 0,
        },
        rules: charForm.rules.filter((r) => r.trim()),
        lore: charForm.lore.filter((l) => l.trim()),
      };

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, character }),
      });

      if (res.ok) {
        setShowCharacterModal(false);
        setAvatarPreview("");
        setAvatarFile(null);
        await loadCharacters();
        if (!currentCharacter) {
          setCurrentCharacter(id);
        }
      } else {
        const data = await res.json();
        alert("保存失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("保存失败：" + err.message);
    } finally {
      setSavingCharacter(false);
    }
  }

  async function deleteChar(id: string) {
    if (!confirm("确定要删除这个角色吗？")) return;
    try {
      const res = await fetch(`/api/characters?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadCharacters();
        if (currentCharacter === id) {
          setCurrentCharacter("");
        }
      } else {
        const data = await res.json();
        alert("删除失败：" + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert("删除失败：" + (err.message || "网络错误"));
    }
  }

  // ========== 模型管理 ==========

  function applyPreset(p: typeof MODEL_PRESETS[number]) {
    setModelForm((f) => ({
      ...f,
      baseURL: p.baseURL,
      model: p.model,
      embeddingModel: p.embeddingModel || "",
      name: f.name.trim() ? f.name : p.label,
    }));
  }

  function openModelModal() {
    setModelForm(DEFAULT_MODEL_FORM);
    setEditingModelId(null);
    setShowModelModal(true);
  }

  // 编辑已有模型（配置 Key / 修改地址等）
  function openEditModel(m: ModelInfo) {
    setEditingModelId(m.id);
    setModelForm({
      name: m.name,
      baseURL: m.baseURL,
      model: m.model,
      embeddingModel: m.embeddingModel || "",
      // 出于安全不回显已存 Key，留空表示不修改（后端会保留原 Key）
      apiKey: "",
    });
    setShowModelModal(true);
  }

  async function saveModelForm() {
    setSavingModel(true);
    try {
      const payload = editingModelId
        ? {
            update: {
              id: editingModelId,
              name: modelForm.name,
              baseURL: modelForm.baseURL,
              model: modelForm.model,
              embeddingModel: modelForm.embeddingModel || undefined,
              apiKey: modelForm.apiKey,
            },
          }
        : {
            model: {
              name: modelForm.name,
              baseURL: modelForm.baseURL,
              model: modelForm.model,
              embeddingModel: modelForm.embeddingModel || undefined,
              apiKey: modelForm.apiKey,
            },
          };

      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setShowModelModal(false);
        await loadModels();
        // 新增模型后自动切换为当前模型
        if (!editingModelId && data.model?.id) {
          await switchModel(data.model.id);
        }
      } else {
        const data = await res.json();
        alert((editingModelId ? "更新失败：" : "添加失败：") + (data.error || "未知错误"));
      }
    } catch (err: any) {
      alert((editingModelId ? "更新失败：" : "添加失败：") + err.message);
    } finally {
      setSavingModel(false);
    }
  }

  async function deleteModel(id: string) {
    if (!confirm("确定要删除这个模型吗？")) return;
    try {
      const res = await fetch(`/api/models?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadModels();
      }
    } catch (err) {
      console.error("删除模型失败:", err);
    }
  }

  const char = characters.find((c) => c.id === currentCharacter);
  const currentModelInfo = models.find((m) => m.id === currentModel);

  return (
    <main className="flex h-screen">
      {/* 左侧角色选择 */}
      {/* 左侧角色选择 */}
      <div className="w-20 bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 flex flex-col items-center py-5 space-y-4">
        {characters.map((c) => (
          <div key={c.id} className="relative group">
            <button
              onClick={() => switchCharacter(c.id)}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition overflow-hidden ${
                currentCharacter === c.id
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 ring-1 ring-gray-900 dark:ring-white"
                  : "bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
              }`}
              title={`${c.name} · ${c.role}`}
            >
              {c.avatar && c.avatar.startsWith("/") ? (
                <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
              ) : (
                c.avatar || "🎭"
              )}
            </button>
            {/* hover 时显示编辑/删除，保持安静 */}
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-1 hidden group-hover:flex flex-col gap-1 z-30">
              <button
                onClick={(e) => { e.stopPropagation(); openEditCharacter(c.id); }}
                className="w-5 h-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full text-[10px] flex items-center justify-center shadow-sm"
                title="编辑角色"
              >
                ✎
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteChar(c.id); }}
                className="w-5 h-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 rounded-full text-[10px] flex items-center justify-center shadow-sm"
                title="删除角色"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={openCreateCharacterModal}
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-transparent border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition mt-1"
          title="创建新角色"
        >
          +
        </button>
        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition mt-auto"
          title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>

      {/* 中间聊天区 */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto bg-white dark:bg-gray-950 border-x border-gray-100 dark:border-gray-800">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {char && char.avatar && char.avatar.startsWith("/") ? (
              <img src={char.avatar} alt={char.name} className="w-9 h-9 rounded-full object-cover" />
            ) : char ? (
              <span className="text-2xl">{char.avatar || "🎭"}</span>
            ) : null}
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {char ? char.name : "Roleplay Agent"}
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">{char ? char.role : "请先创建一个角色"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowExportModal(true)}
              disabled={!currentCharacter}
              className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition disabled:opacity-40"
              title="导出对话"
            >
              导出
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition"
              title="导入对话"
            >
              导入
            </button>
            <button
              onClick={clearCurrentChat}
              disabled={!currentCharacter}
              className="px-2.5 py-1 text-xs text-gray-400 dark:text-gray-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500 transition disabled:opacity-40"
              title="清空对话"
            >
              清空
            </button>
            <button
              onClick={() => {
                loadToolsConfig();
                loadUsage();
                loadMcpServers();
                loadPlugins();
                setShowToolsModal(true);
              }}
              className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition"
              title="工具与 Agent 设置"
            >
              工具
            </button>

            <div className="w-px h-4 bg-gray-200 dark:bg-gray-800 mx-1" />

            <select
              value={currentModel}
              onChange={(e) => switchModel(e.target.value)}
              className="text-xs border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.hasApiKey ? "" : "（未配置 Key）"}
                </option>
              ))}
            </select>
            <button
              onClick={openModelModal}
              className="w-7 h-7 text-xs text-gray-400 dark:text-gray-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition"
              title="管理模型"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-white dark:bg-gray-950">
          {characters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
              <div className="text-3xl mb-4">🎭</div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">还没有角色</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">点击左侧 + 创建你的第一个角色</p>
              <button
                onClick={openCreateCharacterModal}
                className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm rounded-full hover:opacity-90 transition"
              >
                创建角色
              </button>
            </div>
          ) : (
            <>
              {currentMessages.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-bl-sm text-sm text-gray-600 dark:text-gray-300">
                    你好，我是{char?.name}。{char?.role}。今天想聊点什么？
                  </div>
                </div>
              )}
              {currentMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-br-sm"
                        : "bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-bl-sm"
                    }`}
                  >
                    {/* 如果消息包含本地截图链接，显示图片 */}
                    {msg.content.split("\n").some((line) => line.trim().startsWith("/screenshots/") || line.trim().startsWith("/api/screenshots/")) ? (
                      <div className="space-y-2">
                        {msg.content.split("\n").map((line, li) => {
                          if (line.trim().startsWith("/screenshots/") || line.trim().startsWith("/api/screenshots/")) {
                            return (
                              <img
                                key={li}
                                src={line.trim()}
                                alt="网页截图"
                                className="max-w-full rounded-lg border border-gray-200 dark:border-gray-700"
                                style={{ maxHeight: "400px" }}
                              />
                            );
                          }
                          return line ? <div key={li}>{line}</div> : null;
                        })}
                      </div>
                    ) : (
                      <>{msg.content}</>
                    )}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-gray-400 dark:bg-gray-500 ml-1 animate-pulse align-middle rounded-sm" />
                    )}
                  </div>
                </div>
              ))}
              {loading && !currentMessages.some((m) => m.streaming) && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-bl-sm">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
          {/* 工具审批请求 */}
          {pendingApproval && pendingApproval.characterId === currentCharacter && (
            <div className="mb-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                    ⚠️ {char?.name || "角色"} 请求执行以下操作，需要你的确认：
                  </div>
                  {pendingApproval.toolCalls.map((tc, i) => (
                    <div key={i} className="text-xs text-amber-800 dark:text-amber-200/80 truncate">
                      · <span className="font-medium">{getToolLabel(tc.name)}</span>
                      {tc.args && Object.keys(tc.args).length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400">
                          {" "}
                          {JSON.stringify(tc.args).substring(0, 120)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApproval(true)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition"
                  >
                    同意
                  </button>
                  <button
                    onClick={() => handleApproval(false)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* 工具调用状态 */}
          {toolCallsInfo.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {toolCallsInfo.map((tc, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                    tc.status === "calling"
                      ? "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                      : tc.error
                        ? "border-red-200 dark:border-red-900/50 text-red-500"
                        : "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {tc.status === "calling" ? (
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : tc.error ? (
                    <span>✗</span>
                  ) : (
                    <span>✓</span>
                  )}
                  <span>
                    {tc.status === "calling"
                      ? `正在${getToolLabel(tc.name)}...`
                      : tc.error
                        ? `${getToolLabel(tc.name)}失败`
                        : `${getToolLabel(tc.name)}完成`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={char ? `和${char.name}说点什么…` : "请先创建一个角色"}
              disabled={!char}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:cursor-not-allowed transition"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim() || !char}
              className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              发送
            </button>
          </div>
        </div>
      </div>

      {/* 到期提醒弹窗 */}
      {reminderToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-xs">
          {reminderToasts.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-md px-4 py-3"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm leading-none">⏰</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                    {t.content}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    提醒时间：{t.timeText}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReminderToasts((prev) => prev.filter((x) => x.id !== t.id));
                    fetch(`/api/reminders?id=${t.id}`, { method: "DELETE" }).catch(() => {});
                  }}
                  className="text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none"
                  aria-label="关闭提醒"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右侧状态面板 */}
      <div className="w-72 bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 overflow-y-auto hidden lg:block">
        {/* 待触发提醒 */}
        {upcomingReminders.length > 0 && (
          <div className="p-5 border-b">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">提醒</h2>
            <div className="space-y-2">
              {upcomingReminders.slice(0, 5).map((r) => {
                const due = new Date(r.dueAt);
                const diffMin = Math.round((due.getTime() - Date.now()) / 60000);
                const timeLabel =
                  diffMin < 60
                    ? `${Math.max(diffMin, 0)} 分钟后`
                    : diffMin < 1440
                      ? `${Math.round(diffMin / 60)} 小时后`
                      : due.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-gray-800 dark:text-gray-100 truncate">{r.content}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">{timeLabel}</div>
                    </div>
                    <button
                      onClick={() =>
                        fetch(`/api/reminders?id=${r.id}`, { method: "DELETE" })
                          .then(() => setUpcomingReminders((prev) => prev.filter((x) => x.id !== r.id)))
                          .catch(() => {})
                      }
                      className="text-gray-300 hover:text-red-400 text-xs leading-none mt-0.5"
                      aria-label="取消提醒"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="p-5 border-b">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">角色状态</h2>
          {stateInfo ? (
            <div className="space-y-3 text-sm">
              <StateBar label="心情" value={stateInfo.mood} color="bg-gray-400 dark:bg-gray-500" />
              <StateBar label="好感度" value={stateInfo.affection} color="bg-gray-500 dark:bg-gray-400" />
              <StateBar label="信任度" value={stateInfo.trust} color="bg-gray-600 dark:bg-gray-300" />
              <StateBar label="精力" value={stateInfo.energy} color="bg-gray-400 dark:bg-gray-500" />
              <StateBar label="开放度" value={stateInfo.openness} color="bg-gray-500 dark:bg-gray-400" />
              <StateBar label="主导性" value={stateInfo.dominance} color="bg-gray-600 dark:bg-gray-300" />
              <div className="pt-2 border-t">
                <div className="text-gray-500 dark:text-gray-400">剧情阶段</div>
                <div className="font-medium text-gray-800 dark:text-gray-100">{stateInfo.plotStage}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500">开始对话后显示状态</div>
          )}
        </div>

        {understandingInfo && (
          <div className="p-5 border-b">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">输入分析</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">情绪</span>
                <span className="font-medium">{understandingInfo.emotion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">意图</span>
                <span className="font-medium">{understandingInfo.intent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">紧急度</span>
                <span className="font-medium">{understandingInfo.urgency || 0}/10</span>
              </div>
              {understandingInfo.keywords?.length > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">关键词</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {understandingInfo.keywords.map((k: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-900 rounded-full text-xs text-gray-500 dark:text-gray-400">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {plotInfo && plotInfo.triggered && (
          <div className="p-5">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">剧情事件</h2>
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-sm">
              <div className="font-medium text-gray-800 dark:text-gray-100">{plotInfo.node?.name}</div>
              <div className="text-gray-500 dark:text-gray-400 mt-1">{plotInfo.node?.description}</div>
              {plotInfo.node?.dialogueHint && (
                <div className="text-gray-400 dark:text-gray-500 mt-2 text-xs italic">
                  提示：{plotInfo.node.dialogueHint}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========== 角色弹窗 ========== */}
      {showCharacterModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {editingCharacter ? "编辑角色" : "创建新角色"}
              </h2>
              <button
                onClick={() => setShowCharacterModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">名字 *</label>
                  <input
                    type="text"
                    value={charForm.name}
                    onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder="例如：林婉"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">身份 *</label>
                  <input
                    type="text"
                    value={charForm.role}
                    onChange={(e) => setCharForm({ ...charForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder="例如：民国茶馆老板娘"
                  />
                </div>
              </div>

              {/* 角色模板选择（仅创建时显示） */}
              {!editingCharacter && templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">快速创建（选择模板自动填充）</label>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300"
                        title={t.description}
                      >
                        <span>{t.emoji}</span>
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 头像设置 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">头像</label>
                <div className="flex items-center gap-4">
                  {/* 预览 */}
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-3xl overflow-hidden border border-gray-200 dark:border-gray-800">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="预览" className="w-full h-full object-cover" />
                    ) : charForm.avatar && charForm.avatar.startsWith("/") ? (
                      <img src={charForm.avatar} alt="头像" className="w-full h-full object-cover" />
                    ) : (
                      charForm.avatar || "🎭"
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    {/* 类型切换 */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => switchAvatarType("emoji")}
                        className={`px-3 py-1 text-xs rounded-full border transition ${
                          charForm.avatarType === "emoji"
                            ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                            : "bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        Emoji
                      </button>
                      <button
                        type="button"
                        onClick={() => switchAvatarType("image")}
                        className={`px-3 py-1 text-xs rounded-full border transition ${
                          charForm.avatarType === "image"
                            ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                            : "bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        上传图片
                      </button>
                    </div>
                    {/* Emoji 输入 */}
                    {charForm.avatarType === "emoji" && (
                      <input
                        type="text"
                        value={charForm.avatar}
                        onChange={(e) => setCharForm({ ...charForm, avatar: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                        placeholder="🎭"
                      />
                    )}
                    {/* 图片上传 */}
                    {charForm.avatarType === "image" && (
                      <div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300"
                        >
                          {avatarFile ? "更换图片" : "选择图片"}
                        </button>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">支持 PNG/JPG，最大 2MB</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">性格 *</label>
                <textarea
                  value={charForm.personality}
                  onChange={(e) => setCharForm({ ...charForm, personality: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition h-20 resize-none"
                  placeholder="描述角色的性格特点..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">背景故事 *</label>
                <textarea
                  value={charForm.background}
                  onChange={(e) => setCharForm({ ...charForm, background: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition h-20 resize-none"
                  placeholder="角色的经历和背景..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">说话风格 *</label>
                <textarea
                  value={charForm.speakingStyle}
                  onChange={(e) => setCharForm({ ...charForm, speakingStyle: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition h-20 resize-none"
                  placeholder="角色怎么说话？用什么口头禅？"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">当前场景 *</label>
                <input
                  type="text"
                  value={charForm.scene}
                  onChange={(e) => setCharForm({ ...charForm, scene: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                  placeholder="例如：民国茶馆二楼，窗外细雨绵绵"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">规则（每行一条）</label>
                <textarea
                  value={charForm.rules.join("\n")}
                  onChange={(e) => setCharForm({ ...charForm, rules: e.target.value.split("\n") })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition h-24 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">背景知识（每行一条）</label>
                <textarea
                  value={charForm.lore.join("\n")}
                  onChange={(e) => setCharForm({ ...charForm, lore: e.target.value.split("\n") })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition h-24 resize-none"
                  placeholder="角色知道的事情..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCharacterModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                取消
              </button>
              <button
                onClick={saveCharacterForm}
                disabled={savingCharacter || !charForm.name.trim() || !charForm.role.trim()}
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm hover:opacity-90 disabled:opacity-30 transition"
              >
                {savingCharacter ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 模型管理弹窗 ========== */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">模型管理</h2>
              <button
                onClick={() => setShowModelModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition"
              >
                ×
              </button>
            </div>

            {/* 已有模型列表 */}
            <div className="p-6">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">已添加模型</h3>
              <div className="space-y-2 mb-6">
                {models.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {m.name}
                        {m.id === currentModel && (
                          <span className="text-[10px] text-white dark:text-gray-900 bg-gray-900 dark:bg-white px-1.5 py-0.5 rounded-full">当前</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{m.model}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">{m.baseURL}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {m.hasApiKey ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">已配置</span>
                      ) : (
                        <span className="text-xs text-red-500 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-full">未配置 Key</span>
                      )}
                      <button
                        onClick={() => openEditModel(m)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-xs px-2 transition"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteModel(m.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-500 text-xs px-2 transition"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 添加新模型表单 */}
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 border-t pt-4">
                {editingModelId ? "编辑模型" : "添加新模型"}
              </h3>

              {!editingModelId && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">快速填充（点击自动填好地址和模型 ID）</div>
                  <div className="flex flex-wrap gap-2">
                    {MODEL_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="px-2.5 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-300"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">模型名称 *</label>
                  <input
                    type="text"
                    value={modelForm.name}
                    onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder="例如：我的 DeepSeek"
                  />
                </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Base URL *</label>
                <input
                  type="text"
                  value={modelForm.baseURL}
                  onChange={(e) => setModelForm({ ...modelForm, baseURL: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                  placeholder="例如：https://api.deepseek.com/v1"
                />
                {modelForm.baseURL.trim() && !/^https?:\/\//i.test(modelForm.baseURL.trim()) && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">Base URL 必须以 http:// 或 https:// 开头</p>
                )}
              </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Chat 模型 ID *</label>
                  <input
                    type="text"
                    value={modelForm.model}
                    onChange={(e) => setModelForm({ ...modelForm, model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder="例如：moonshot-v1-8k / deepseek-chat / qwen-turbo"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">⚠️ 这是模型的技术 ID（不是显示名称）。填错会出现 404 找不到模型。</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Embedding 模型 ID（可选）</label>
                  <input
                    type="text"
                    value={modelForm.embeddingModel}
                    onChange={(e) => setModelForm({ ...modelForm, embeddingModel: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder="不填则使用其他模型的 embedding"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    API Key {editingModelId ? "（留空则不修改）" : "*"}
                  </label>
                  <input
                    type="password"
                    value={modelForm.apiKey}
                    onChange={(e) => setModelForm({ ...modelForm, apiKey: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 text-sm bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition"
                    placeholder={editingModelId ? "不修改请留空" : "sk-..."}
                  />
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-500 dark:text-gray-400">
                💡 支持任何 OpenAI 兼容格式的 API。常见 Base URL：
                <div className="mt-1 space-y-0.5">
                  <div>Kimi: https://api.moonshot.cn/v1</div>
                  <div>DeepSeek: https://api.deepseek.com/v1</div>
                  <div>通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1</div>
                  <div>OpenAI: https://api.openai.com/v1</div>
                  <div>本地 Ollama: http://localhost:11434/v1</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowModelModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                关闭
              </button>
              <button
                onClick={saveModelForm}
                disabled={
                  savingModel ||
                  !modelForm.name.trim() ||
                  !modelForm.baseURL.trim() ||
                  !/^https?:\/\//i.test(modelForm.baseURL.trim()) ||
                  !modelForm.model.trim() ||
                  (!editingModelId && !modelForm.apiKey.trim())
                }
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm hover:opacity-90 disabled:opacity-30 transition"
              >
                {savingModel
                  ? editingModelId
                    ? "保存中..."
                    : "添加中..."
                  : editingModelId
                  ? "保存修改"
                  : "添加模型"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 工具与 Agent 设置弹窗 ========== */}
      {showToolsModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 dark:border-gray-800 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">工具与 Agent 设置</h2>
              <button
                onClick={() => setShowToolsModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* 审批模式 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  高危工具审批（执行命令 / 写文件 / 打开应用 / 桌面截图）
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setToolsConfig((prev) =>
                        prev ? { ...prev, settings: { ...prev.settings, approvalMode: "manual" } } : prev
                      )
                    }
                    className={`flex-1 p-2.5 rounded-lg border text-xs transition ${
                      toolsConfig?.settings.approvalMode === "manual"
                        ? "border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    需要我批准（推荐）
                  </button>
                  <button
                    onClick={() =>
                      setToolsConfig((prev) =>
                        prev ? { ...prev, settings: { ...prev.settings, approvalMode: "auto" } } : prev
                      )
                    }
                    className={`flex-1 p-2.5 rounded-lg border text-xs transition ${
                      toolsConfig?.settings.approvalMode === "auto"
                        ? "border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    自动执行
                  </button>
                </div>
              </div>

              {/* Agent 参数 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">最大循环轮数</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={toolsConfig?.settings.maxIterations ?? 5}
                    onChange={(e) =>
                      setToolsConfig((prev) =>
                        prev
                          ? { ...prev, settings: { ...prev.settings, maxIterations: Number(e.target.value) } }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">回复 maxTokens</label>
                  <input
                    type="number"
                    min={200}
                    max={32000}
                    step={100}
                    value={toolsConfig?.settings.maxTokens ?? 2048}
                    onChange={(e) =>
                      setToolsConfig((prev) =>
                        prev
                          ? { ...prev, settings: { ...prev.settings, maxTokens: Number(e.target.value) } }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">工具超时(秒)</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={Math.round((toolsConfig?.settings.toolTimeoutMs ?? 30000) / 1000)}
                    onChange={(e) =>
                      setToolsConfig((prev) =>
                        prev
                          ? { ...prev, settings: { ...prev.settings, toolTimeoutMs: Number(e.target.value) * 1000 } }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                  />
                </div>
              </div>

              {/* 工具开关 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">工具开关</label>
                <div className="space-y-1.5">
                  {toolsConfig?.tools.map((t) => (
                    <label
                      key={t.name}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 dark:text-gray-200">{getToolLabel(t.name)}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {t.category}
                          </span>
                          {t.highRisk && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/50 text-red-500 dark:text-red-400">
                              高危
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{t.description}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={t.enabled}
                        onChange={() => toggleToolEnabled(t.name)}
                        className="w-4 h-4 shrink-0 accent-gray-900 dark:accent-gray-100 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* 用量统计 */}
              {usage && (
                <div className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-4">
                  累计用量：输入 {usage.total.promptTokens.toLocaleString()} tokens · 输出{" "}
                  {usage.total.completionTokens.toLocaleString()} tokens · 共 {usage.total.calls} 次调用
                </div>
              )}

              {/* 动态工具加载错误 */}
              {dynamicErrors.length > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-100 dark:border-amber-900">
                  <div className="font-medium mb-1">部分外部工具加载失败</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {dynamicErrors.map((e, i) => (
                      <li key={i}>
                        {e.source}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* MCP 服务器管理 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">MCP 服务器</label>
                  <button
                    onClick={() => {
                      setMcpForm({ name: "", transport: "stdio", command: "", args: "", url: "", env: "" });
                      setShowMcpForm((s) => !s);
                    }}
                    className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    {showMcpForm ? "取消" : "添加"}
                  </button>
                </div>

                {showMcpForm && (
                  <div className="space-y-2 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 mb-2">
                    <input
                      type="text"
                      placeholder="名称"
                      value={mcpForm.name}
                      onChange={(e) => setMcpForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                    />
                    <select
                      value={mcpForm.transport}
                      onChange={(e) => setMcpForm((f) => ({ ...f, transport: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                    >
                      <option value="stdio">stdio</option>
                      <option value="sse">sse</option>
                      <option value="http">http</option>
                    </select>
                    {mcpForm.transport === "stdio" ? (
                      <>
                        <input
                          type="text"
                          placeholder="命令（如 npx、uvx、node）"
                          value={mcpForm.command}
                          onChange={(e) => setMcpForm((f) => ({ ...f, command: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                        />
                        <input
                          type="text"
                          placeholder="参数（空格分隔，可选）"
                          value={mcpForm.args}
                          onChange={(e) => setMcpForm((f) => ({ ...f, args: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                        />
                      </>
                    ) : (
                      <input
                        type="text"
                        placeholder="服务器 URL"
                        value={mcpForm.url}
                        onChange={(e) => setMcpForm((f) => ({ ...f, url: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                      />
                    )}
                    <textarea
                      placeholder="环境变量 JSON（可选）"
                      value={mcpForm.env}
                      onChange={(e) => setMcpForm((f) => ({ ...f, env: e.target.value }))}
                      className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-gray-400 dark:focus:border-gray-600"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveMcpServer}
                        className="flex-1 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-xs font-medium hover:opacity-90 transition"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setShowMcpForm(false)}
                        className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {mcpServers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              s.status === "connected"
                                ? "bg-green-500"
                                : s.status === "error"
                                ? "bg-red-500"
                                : "bg-gray-300 dark:bg-gray-600"
                            }`}
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{s.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {s.transport}
                          </span>
                          {s.tools?.length > 0 && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {s.tools.length} 个工具
                            </span>
                          )}
                        </div>
                        {s.error && (
                          <div className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 truncate">{s.error}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => toggleMcp(s.id, !s.enabled)}
                          className="w-4 h-4 accent-gray-900 dark:accent-gray-100 cursor-pointer"
                        />
                        <button
                          onClick={() => testMcp(s)}
                          disabled={mcpTesting === s.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition"
                        >
                          {mcpTesting === s.id ? "测试中" : "测试"}
                        </button>
                        <button
                          onClick={() => {
                            setMcpForm({
                              id: s.id,
                              name: s.name,
                              transport: s.transport,
                              command: s.command || "",
                              args: (s.args || []).join(" "),
                              url: s.url || "",
                              env: s.env ? JSON.stringify(s.env, null, 2) : "",
                            });
                            setShowMcpForm(true);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => deleteMcp(s.id)}
                          className="text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 dark:text-red-400 transition"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                  {mcpServers.length === 0 && !mcpLoading && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">暂无 MCP 服务器</div>
                  )}
                  {mcpLoading && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">加载中…</div>
                  )}
                </div>
              </div>

              {/* 插件列表 */}
              {pluginList.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">已安装插件</label>
                  <div className="space-y-1.5">
                    {pluginList.map((p) => (
                      <div
                        key={p.name}
                        className="p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 dark:text-gray-200">{p.displayName || p.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            v{p.version}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {p.tools?.length || 0} 个工具
                          </span>
                        </div>
                        {p.description && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              <button
                onClick={() => setShowToolsModal(false)}
                className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                取消
              </button>
              <button
                onClick={saveToolsSettings}
                disabled={savingTools}
                className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition"
              >
                {savingTools ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 导出弹窗 ========== */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">导出对话</h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {currentCharacter && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    导出与 <strong>{char?.name}</strong> 的对话记录
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => exportChat("json")}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-center text-gray-700 dark:text-gray-200"
                    >
                      <div className="text-xl mb-2 text-gray-400">📄</div>
                      <div className="text-sm font-medium">JSON 格式</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">可重新导入</div>
                    </button>
                    <button
                      onClick={() => exportChat("markdown")}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-center text-gray-700 dark:text-gray-200"
                    >
                      <div className="text-xl mb-2 text-gray-400">📝</div>
                      <div className="text-sm font-medium">Markdown 格式</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">适合阅读</div>
                    </button>
                  </div>
                </>
              )}
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">备份所有角色的对话</p>
                <button
                  onClick={exportAllChats}
                  className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-center text-gray-700 dark:text-gray-200"
                >
                  <div className="text-lg mb-1 text-gray-400">💾</div>
                  <div className="text-sm font-medium">导出全部对话</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">包含所有角色的聊天记录</div>
                </button>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 导入弹窗 ========== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">导入对话</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg transition"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.md"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      importChat(file, "single");
                    }
                  }}
                  className="hidden"
                />
                <div className="text-2xl mb-3 text-gray-300">📂</div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  选择要导入的对话文件（JSON 格式）
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm hover:opacity-90 disabled:opacity-30 transition"
                >
                  {importing ? "导入中..." : "选择文件"}
                </button>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">从完整备份恢复</p>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      importChat(file, "all");
                    }
                  }}
                  className="hidden"
                  id="import-all-input"
                />
                <label
                  htmlFor="import-all-input"
                  className="block w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-center cursor-pointer text-gray-700 dark:text-gray-200"
                >
                  <div className="text-lg mb-1 text-gray-400">📦</div>
                  <div className="text-sm font-medium">恢复全部对话</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">从「导出全部」的备份文件恢复</div>
                </label>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400">
                <strong>注意：</strong> 导入的对话会覆盖该角色现有的对话历史。
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StateBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value + 100) / 2));
  return (
    <div>
      <div className="flex justify-between text-gray-500 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formToId(name: string): string {
  // 保留中文、英文、数字，空格替换为连字符，去除其他特殊字符
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-]/g, "")
    .toLowerCase();
}
