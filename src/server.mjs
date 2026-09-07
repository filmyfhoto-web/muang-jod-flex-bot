import http from "node:http";
import crypto from "node:crypto";

const PORT = process.env.PORT || 3000;

const CHANNEL_SECRET =
  process.env.LINE_CHANNEL_SECRET || "";

const CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

function verifySignature(body, signature) {
  if (!CHANNEL_SECRET) {
    console.error("LINE_CHANNEL_SECRET ยังไม่ได้ตั้งค่า");
    return false;
  }

  const hash = crypto
    .createHmac("SHA256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");

  return hash === signature;
}

async function replyMessage(replyToken, messages) {
  if (!CHANNEL_ACCESS_TOKEN) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า");
    return;
  }

  const response = await fetch(
    "https://api.line.me/v2/bot/message/reply",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
      }),
    }
  );

  if (!response.ok) {
    console.error(
      "LINE Reply Error:",
      response.status,
      await response.text()
    );
  }
}

async function handleEvent(event) {
  console.log("LINE EVENT:", JSON.stringify(event));

  // ข้อความจากผู้ใช้
  if (
    event.type === "message" &&
    event.message?.type === "text"
  ) {
    const text = event.message.text;

    await replyMessage(event.replyToken, [
      {
        type: "text",
        text:
          `ได้เลยค่ะ 💜 ม่วงจดได้รับแล้ว\n\n` +
          `${text}\n\n` +
          `กำลังเตรียมระบบบันทึกงานให้นะคะ`,
      },
    ]);

    return;
  }

  // Postback
  if (event.type === "postback") {
    await replyMessage(event.replyToken, [
      {
        type: "text",
        text: `ม่วงจดได้รับคำสั่งแล้วค่ะ 💜`,
      },
    ]);
  }
}

const server = http.createServer((req, res) => {
  // หน้า Health Check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
    });

    res.end(
      JSON.stringify({
        ok: true,
        bot: "ม่วงจดให้",
        webhook: "/webhook",
      })
    );

    return;
  }

  // LINE Webhook
  if (req.method === "POST" && req.url === "/webhook") {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      const rawBody = Buffer.concat(chunks);

      const signature =
        req.headers["x-line-signature"] || "";

      // LINE Verify อาจส่ง events ว่างมา
      if (
        CHANNEL_SECRET &&
        !verifySignature(rawBody, signature)
      ) {
        console.error("Invalid LINE signature");

        res.writeHead(401);
        res.end("Invalid signature");
        return;
      }

      let body;

      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        res.writeHead(400);
        res.end("Invalid JSON");
        return;
      }

      // ต้องตอบ LINE 200 ก่อน
      res.writeHead(200, {
        "Content-Type": "text/plain",
      });

      res.end("OK");

      // แล้วค่อยประมวลผล
      for (const event of body.events || []) {
        handleEvent(event).catch(console.error);
      }
    });

    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`💜 ม่วงจดให้ running on port ${PORT}`);
  console.log(`Webhook: /webhook`);
});