import { ImapFlow } from 'imapflow';
import { getConfig } from '@/lib/config';

export interface IncomingReply {
  threadId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

/**
 * Create an ImapFlow client from app config.
 */
function createImapClient(): ImapFlow {
  const config = getConfig();

  if (!config.imap.user || !config.imap.pass) {
    throw new Error(
      "IMAP credentials are not configured. Update the SQLite-backed IMAP settings and retry."
    );
  }

  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: true,
    auth: {
      user: config.imap.user,
      pass: config.imap.pass,
    },
    logger: false,
  });
}

/**
 * Parse raw header buffer into a map of header name -> value.
 */
function parseHeaders(headerBuffer: Buffer): Map<string, string> {
  const headerText = headerBuffer.toString('utf-8');
  const result = new Map<string, string>();
  const lines = headerText.split(/\r?\n/);
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      // Continuation of previous header
      currentValue += ' ' + line.trim();
    } else {
      if (currentKey) {
        result.set(currentKey.toLowerCase(), currentValue);
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        currentKey = line.slice(0, colonIdx).trim();
        currentValue = line.slice(colonIdx + 1).trim();
      } else {
        currentKey = '';
        currentValue = '';
      }
    }
  }
  if (currentKey) {
    result.set(currentKey.toLowerCase(), currentValue);
  }

  return result;
}

/**
 * Extract plain text body from a message source.
 * Handles both simple and multipart messages.
 */
async function extractTextBody(
  client: ImapFlow,
  seq: number
): Promise<string> {
  // Download the full message source and parse
  const downloadResult = await client.download(String(seq), undefined, {
    uid: false,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of downloadResult.content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawSource = Buffer.concat(chunks).toString('utf-8');

  // Simple extraction: find text content after headers
  // For production, consider using mailparser for robust MIME handling
  const headerBodySplit = rawSource.indexOf('\r\n\r\n');
  if (headerBodySplit === -1) {
    return rawSource;
  }

  return rawSource.slice(headerBodySplit + 4).trim();
}

/**
 * Poll IMAP for unread replies matching known thread message IDs.
 * Connects, searches UNSEEN messages, matches In-Reply-To / References
 * headers against the provided thread IDs, and returns matching replies.
 */
export async function pollForReplies(
  knownThreadIds: string[]
): Promise<IncomingReply[]> {
  if (knownThreadIds.length === 0) {
    return [];
  }

  const threadIdSet = new Set(
    knownThreadIds.map((id) => id.replace(/^<|>$/g, ''))
  );

  const client = createImapClient();
  const replies: IncomingReply[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for unseen messages
      const unseenMessages = await client.search({ seen: false });

      if (!unseenMessages || unseenMessages.length === 0) {
        return [];
      }

      // Fetch headers for unseen messages
      for await (const message of client.fetch(unseenMessages, {
        envelope: true,
        headers: ['in-reply-to', 'references'],
        uid: true,
      })) {
        const parsedHeaders = message.headers
          ? parseHeaders(message.headers)
          : new Map<string, string>();

        const inReplyTo =
          parsedHeaders
            .get('in-reply-to')
            ?.trim()
            .replace(/^<|>$/g, '') || '';

        const referencesRaw =
          parsedHeaders.get('references')?.trim() || '';

        const references = referencesRaw
          .split(/\s+/)
          .map((r) => r.replace(/^<|>$/g, ''))
          .filter(Boolean);

        // Check if any header references match our known thread IDs
        let matchedThreadId: string | null = null;

        if (inReplyTo && threadIdSet.has(inReplyTo)) {
          matchedThreadId = inReplyTo;
        } else {
          for (const ref of references) {
            if (threadIdSet.has(ref)) {
              matchedThreadId = ref;
              break;
            }
          }
        }

        if (matchedThreadId && message.envelope) {
          const body = await extractTextBody(client, message.seq);

          const fromAddress =
            message.envelope.from?.[0]?.address ||
            message.envelope.sender?.[0]?.address ||
            '';
          const fromName = message.envelope.from?.[0]?.name || '';
          const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

          replies.push({
            threadId: matchedThreadId,
            from,
            subject: message.envelope.subject || '',
            body,
            receivedAt: message.envelope.date || new Date(),
          });
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown IMAP error';
    throw new Error(`IMAP poll failed: ${message}`);
  } finally {
    await client.logout().catch(() => {
      // Ignore logout errors during cleanup
    });
  }

  return replies;
}
