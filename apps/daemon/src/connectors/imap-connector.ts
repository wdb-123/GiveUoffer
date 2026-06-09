import { connect, type TLSSocket } from "node:tls";
import type {
  ConnectorProtocolConfig,
  EmailMessageSummary,
  ImportEmailMessagesRequest,
  ImportEmailMessagesResult,
  TestEmailConnectorRequest,
  TestEmailConnectorResult,
} from "@ucareer/shared";
import { getConnector } from "./connector-registry";

const QQ_EMAIL_CONNECTOR_ID = "qq-email";

export async function testQqEmailImapConnection(input: TestEmailConnectorRequest): Promise<TestEmailConnectorResult> {
  const connector = getConnector(QQ_EMAIL_CONNECTOR_ID);
  if (!connector?.protocol || connector.protocol.type !== "imap") {
    throw new Error("QQ email connector is not configured for IMAP");
  }

  const email = normalizeEmail(input.email);
  const authorizationCode = normalizeAuthorizationCode(input.authorizationCode);
  if (!email.endsWith("@qq.com")) throw new Error("请输入 QQ 邮箱地址，例如 name@qq.com");
  if (!authorizationCode) throw new Error("请输入 QQ 邮箱 IMAP 授权码");

  const session = await openImapSession(connector.protocol);
  try {
    const greeting = await session.readGreeting();
    const login = await session.command(`LOGIN ${quoteImapString(email)} ${quoteImapString(authorizationCode)}`);
    if (!login.ok) {
      throw new Error("QQ 邮箱 IMAP 登录失败，请确认已开启 IMAP 服务并填写 16 位授权码");
    }
    await session.command("LOGOUT").catch(() => undefined);
    return {
      connectorId: connector.id,
      email,
      connected: true,
      checkedAt: new Date().toISOString(),
      protocol: connector.protocol,
      serverGreeting: greeting,
    };
  } finally {
    session.close();
  }
}

export async function importQqEmailMessages(input: {
  email: string;
  authorizationCode: string;
  request?: ImportEmailMessagesRequest;
}): Promise<ImportEmailMessagesResult> {
  const connector = getConnector(QQ_EMAIL_CONNECTOR_ID);
  if (!connector?.protocol || connector.protocol.type !== "imap") {
    throw new Error("QQ email connector is not configured for IMAP");
  }

  const email = normalizeEmail(input.email);
  const authorizationCode = normalizeAuthorizationCode(input.authorizationCode);
  const request = withDefaultDateWindow(input.request);
  const mailbox = normalizeMailbox(request?.mailbox);
  const limit = clampLimit(request?.limit);
  const offset = clampOffset(request?.offset);
  const search = buildSearchCommand(request);
  const snippetBytes = clampSnippetBytes(request?.snippetBytes);

  const session = await openImapSession(connector.protocol);
  try {
    await session.readGreeting();
    const login = await session.command(`LOGIN ${quoteImapString(email)} ${quoteImapString(authorizationCode)}`);
    if (!login.ok) throw new Error("QQ 邮箱 IMAP 登录失败，请重新检查授权码");

    const select = await session.command(`SELECT ${quoteImapMailbox(mailbox)}`);
    if (!select.ok) throw new Error(`无法打开 QQ 邮箱文件夹: ${mailbox}`);

    const messages = hasLocalSearchFilters(input.request)
      ? await searchMessagesWithLocalFilters({
          session,
          request,
          mailbox,
          limit,
          offset,
          snippetBytes,
        })
      : await searchMessagesByServerCriteria({
          session,
          search,
          mailbox,
          limit,
          offset,
          snippetBytes,
        });

    await session.command("LOGOUT").catch(() => undefined);
    return {
      connectorId: connector.id,
      account: email,
      mailbox,
      importedAt: new Date().toISOString(),
      messages: sortMessagesByDate(messages),
    };
  } finally {
    session.close();
  }
}

interface ImapCommandResult {
  ok: boolean;
  lines: string[];
}

interface ImapSession {
  readGreeting(): Promise<string>;
  command(command: string): Promise<ImapCommandResult>;
  close(): void;
}

async function fetchMessageSummaries(input: {
  session: ImapSession;
  uids: string[];
  mailbox: string;
  snippetBytes: number;
}): Promise<EmailMessageSummary[]> {
  const messages: EmailMessageSummary[] = [];
  for (const uid of input.uids) {
    const fetched = await input.session.command(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.${input.snippetBytes}>)`);
    if (fetched.ok) messages.push(parseFetchedMessage({ uid, mailbox: input.mailbox, lines: fetched.lines, snippetBytes: input.snippetBytes }));
  }
  return messages;
}

async function searchMessagesByServerCriteria(input: {
  session: ImapSession;
  search: { withCharset: string; withoutCharset: string };
  mailbox: string;
  limit: number;
  offset: number;
  snippetBytes: number;
}): Promise<EmailMessageSummary[]> {
  let searchResult = await input.session.command(input.search.withCharset);
  if (!searchResult.ok && input.search.withoutCharset !== input.search.withCharset) {
    searchResult = await input.session.command(input.search.withoutCharset);
  }
  if (!searchResult.ok) throw new Error("QQ 邮箱消息搜索失败");
  const matchedUids = parseSearchUids(searchResult.lines);
  const uids = pageNewestUids(matchedUids, input.limit, input.offset);
  return fetchMessageSummaries({
    session: input.session,
    uids,
    mailbox: input.mailbox,
    snippetBytes: input.snippetBytes,
  });
}

async function searchMessagesWithLocalFilters(input: {
  session: ImapSession;
  request: ImportEmailMessagesRequest | undefined;
  mailbox: string;
  limit: number;
  offset: number;
  snippetBytes: number;
}): Promise<EmailMessageSummary[]> {
  const broadSearch = buildSearchCommand(stripLocalSearchFilters(input.request));
  let searchResult = await input.session.command(broadSearch.withCharset);
  if (!searchResult.ok && broadSearch.withoutCharset !== broadSearch.withCharset) {
    searchResult = await input.session.command(broadSearch.withoutCharset);
  }
  if (!searchResult.ok) throw new Error("QQ 邮箱消息搜索失败");

  const matchedUids = parseSearchUids(searchResult.lines);
  const candidateLimit = Math.min(500, Math.max(100, input.limit + input.offset + 80));
  const candidateUids = pageNewestUids(matchedUids, candidateLimit, 0);
  const candidates = await fetchMessageSummaries({
    session: input.session,
    uids: candidateUids,
    mailbox: input.mailbox,
    snippetBytes: input.snippetBytes,
  });
  return sortMessagesByDate(candidates)
    .filter((message) => matchesLocalSearchFilters(message, input.request))
    .slice(input.offset, input.offset + input.limit);
}

function pageNewestUids(matchedUids: string[], limit: number, offset: number): string[] {
  const end = offset ? Math.max(0, matchedUids.length - offset) : matchedUids.length;
  const start = Math.max(0, end - limit);
  return matchedUids.slice(start, end).reverse();
}

async function openImapSession(config: ConnectorProtocolConfig): Promise<ImapSession> {
  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const client = connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      timeout: 12_000,
    });
    client.setEncoding("utf8");
    client.once("secureConnect", () => resolve(client));
    client.once("timeout", () => {
      client.destroy();
      reject(new Error("QQ 邮箱 IMAP 连接超时"));
    });
    client.once("error", reject);
  });

  let tagIndex = 0;
  let cursor = 0;
  const lines: string[] = [];
  let pendingWake: (() => void) | undefined;

  socket.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line) lines.push(line);
    }
    pendingWake?.();
    pendingWake = undefined;
  });

  async function waitFor(predicate: (line: string) => boolean): Promise<string[]> {
    const start = cursor;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      for (let index = cursor; index < lines.length; index += 1) {
        if (predicate(lines[index] || "")) {
          cursor = index + 1;
          return lines.slice(start, cursor);
        }
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 200);
        pendingWake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    throw new Error("QQ 邮箱 IMAP 响应超时");
  }

  return {
    async readGreeting() {
      const greeting = await waitFor((line) => line.startsWith("* OK") || line.startsWith("* PREAUTH") || line.startsWith("* BYE"));
      return greeting.join("\n");
    },
    async command(commandText) {
      tagIndex += 1;
      const tag = `uc${String(tagIndex).padStart(4, "0")}`;
      socket.write(`${tag} ${commandText}\r\n`);
      const responseLines = await waitFor((line) => line.startsWith(`${tag} `));
      const taggedLine = responseLines[responseLines.length - 1] || "";
      return {
        ok: new RegExp(`^${tag} OK\\b`, "i").test(taggedLine),
        lines: responseLines,
      };
    },
    close() {
      socket.destroy();
    },
  };
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeAuthorizationCode(value: unknown): string {
  return String(value || "").replace(/\s+/g, "");
}

function normalizeMailbox(value: unknown): string {
  const mailbox = String(value || "INBOX").trim();
  return mailbox || "INBOX";
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function clampOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10_000, Math.trunc(parsed)));
}

function clampSnippetBytes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4000;
  return Math.max(800, Math.min(12_000, Math.trunc(parsed)));
}

function quoteImapString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quoteImapMailbox(value: string): string {
  return quoteImapString(value);
}

function parseSearchUids(lines: string[]): string[] {
  return lines
    .flatMap((line) => {
      const match = line.match(/^\* SEARCH\s+(.+)$/i);
      return match?.[1] ? match[1].trim().split(/\s+/) : [];
    })
    .filter(Boolean)
    .sort((left, right) => Number(left) - Number(right));
}

function buildSearchCommand(request: ImportEmailMessagesRequest | undefined): { withCharset: string; withoutCharset: string } {
  const parts: string[] = [];
  if (request?.query === "unseen") parts.push("UNSEEN");
  if (request?.sinceDate) parts.push("SINCE", formatImapDate(request.sinceDate));
  if (request?.beforeDate) parts.push("BEFORE", formatImapDate(request.beforeDate));
  if (isNonEmpty(request?.from)) parts.push("FROM", quoteImapString(request.from.trim()));
  if (isNonEmpty(request?.subject)) parts.push("SUBJECT", quoteImapString(request.subject.trim()));
  if (isNonEmpty(request?.content)) parts.push("BODY", quoteImapString(request.content.trim()));
  const criteria = parts.length ? parts.join(" ") : "ALL";
  return {
    withCharset: hasNonAscii(criteria) ? `UID SEARCH CHARSET UTF-8 ${criteria}` : `UID SEARCH ${criteria}`,
    withoutCharset: `UID SEARCH ${criteria}`,
  };
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonAscii(value: string): boolean {
  return /[^\x00-\x7F]/.test(value);
}

function hasLocalSearchFilters(request: ImportEmailMessagesRequest | undefined): boolean {
  return Boolean(isNonEmpty(request?.from) || isNonEmpty(request?.subject) || isNonEmpty(request?.content));
}

function stripLocalSearchFilters(request: ImportEmailMessagesRequest | undefined): ImportEmailMessagesRequest | undefined {
  if (!request) return undefined;
  const { from: _from, subject: _subject, content: _content, ...rest } = request;
  return rest;
}

function withDefaultDateWindow(request: ImportEmailMessagesRequest | undefined): ImportEmailMessagesRequest | undefined {
  if (request?.sinceDate || request?.beforeDate) return request;
  const now = new Date();
  return {
    ...(request || {}),
    sinceDate: formatDateForDefaultWindow(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)),
    beforeDate: formatDateForDefaultWindow(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
  };
}

function formatDateForDefaultWindow(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function matchesLocalSearchFilters(message: EmailMessageSummary, request: ImportEmailMessagesRequest | undefined): boolean {
  const from = normalizeSearchText(message.from);
  const subject = normalizeSearchText(message.subject);
  const content = normalizeSearchText(`${message.subject} ${message.snippet}`);
  if (isNonEmpty(request?.from) && !matchesSearchTerms(from, request.from)) return false;
  if (isNonEmpty(request?.subject) && !matchesSearchTerms(subject, request.subject)) return false;
  if (isNonEmpty(request?.content) && !matchesSearchTerms(content, request.content)) return false;
  return true;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSearchTerms(haystack: string, query: string): boolean {
  const terms = normalizeSearchText(query).split(/[\s,，、|/]+/u).filter(Boolean);
  if (!terms.length) return true;
  return terms.some((term) => haystack.includes(term));
}

function formatImapDate(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value.trim();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[Number(match[2]) - 1] || "Jan";
  return `${match[3]}-${month}-${match[1]}`;
}

function parseFetchedMessage(input: { uid: string; mailbox: string; lines: string[]; snippetBytes: number }): EmailMessageSummary {
  const joined = input.lines.join("\n");
  const from = decodeMimeHeader(readHeader(joined, "from"));
  const subject = decodeMimeHeader(readHeader(joined, "subject"));
  const date = decodeMimeHeader(readHeader(joined, "date"));
  const snippet = cleanSnippet(extractBodySnippet(joined), input.snippetBytes);
  return {
    uid: input.uid,
    mailbox: input.mailbox,
    from,
    subject,
    date,
    snippet,
  };
}

function sortMessagesByDate(messages: EmailMessageSummary[]): EmailMessageSummary[] {
  return [...messages].sort((left, right) => {
    const rightTime = Date.parse(right.date);
    const leftTime = Date.parse(left.date);
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) return rightTime - leftTime;
    return Number(right.uid) - Number(left.uid);
  });
}

function readHeader(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || "";
}

function extractBodySnippet(raw: string): string {
  const markerIndex = raw.search(/BODY\[TEXT\]/i);
  const body = markerIndex >= 0 ? raw.slice(markerIndex) : raw;
  return body
    .replace(/^.*BODY\[TEXT\][^\n]*\n?/i, "")
    .replace(/\nuc\d+\s+OK[\s\S]*$/i, "")
    .replace(/\n\)\s*$/g, "");
}

function cleanSnippet(value: string, maxLength = 800): string {
  return decodeMimeHeader(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/=\r?\n/g, "")
    .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_match, charset: string, encoding: string, text: string) => {
    try {
      const bytes = encoding.toUpperCase() === "B"
        ? Buffer.from(text, "base64")
        : Buffer.from(text.replace(/_/g, " ").replace(/=([A-Fa-f0-9]{2})/g, (_: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
      return bytes.toString(charset.toLowerCase().includes("gb") ? "utf8" : "utf8");
    } catch {
      return text;
    }
  });
}
