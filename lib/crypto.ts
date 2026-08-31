import * as crypto from "crypto";

// 使用机器相关的信息生成密钥，增加安全性
// 注意：这不是绝对安全，但比明文存储好得多
function getKey(): Buffer {
  // 组合多个信息生成密钥
  const hostname = require("os").hostname();
  const username = require("os").userInfo().username;
  const platform = require("os").platform();

  // 使用 PBKDF2 派生密钥
  const salt = Buffer.from("roleplay-agent-v1", "utf-8");
  const baseKey = `${hostname}:${username}:${platform}`;

  return crypto.pbkdf2Sync(baseKey, salt, 100000, 32, "sha256");
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 加密文本
 */
export function encrypt(text: string): string {
  if (!text) return "";

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf-8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:encryptedData
    return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (err) {
    console.error("加密失败:", err);
    return text; // 失败时返回原文，避免数据丢失
  }
}

/**
 * 解密文本
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";

  // 如果不是加密格式，直接返回（向后兼容明文）
  if (!encryptedText.startsWith("enc:")) {
    return encryptedText;
  }

  try {
    const key = getKey();
    const parts = encryptedText.split(":");

    if (parts.length !== 4) {
      console.error("无效的加密格式");
      return "";
    }

    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encrypted = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (err) {
    console.error("解密失败:", err);
    return encryptedText; // 解密失败返回原文，避免数据丢失
  }
}

/**
 * 检查文本是否已加密
 */
export function isEncrypted(text: string): boolean {
  return text?.startsWith("enc:") ?? false;
}
