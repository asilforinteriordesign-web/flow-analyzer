// هاد الملف بيشتغل على السيرفر (مش بالمتصفح)، فمفتاح الـ API بيضل مخفي وآمن.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType, roomType, notes } = req.body || {};
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: "الصورة مفقودة" });
    }

    const systemPrompt = `إنتِ خبيرة تصميم داخلي وإرغونوميا فلسطينية، عندك منهجية اسمها "هندسة التدفق" بتجمع بين الإرغونوميا العلمية ومبادئ الفنغ شوي، وبتخاطبي نساء عاملات مشغولات بدهن بيت مرتاح وعملي بدون ما ياخد وقتهن. حللي صورة المساحة يلي رح توصلك، ورجعي تحليل شامل يغطي: التصميم العام وتدفق الحركة، الألوان، الإضاءة، الإرغونوميا، والفنغ شوي/الطاقة. اكتبي بالعربي بلهجة فلسطينية/شامية بسيطة ومباشرة، بدون فصحى متكلفة.

رجعي الرد كـ JSON فقط، بدون أي نص قبله أو بعده، وبدون علامات markdown. الشكل المطلوب بالضبط:
{
  "overall_score": <رقم من 1 لـ10>,
  "overall_impression": "<جملتين توصيف عام>",
  "sections": [
    {"key":"layout","strengths":["...","..."],"issues":["...","..."],"suggestions":["...","..."],"analysis":""},
    {"key":"colors","strengths":[],"issues":[],"suggestions":[],"analysis":"<تحليل الألوان بجملتين>"},
    {"key":"lighting","strengths":[],"issues":[],"suggestions":[],"analysis":"<تحليل الإضاءة بجملتين>"},
    {"key":"ergonomics","strengths":["...","..."],"issues":["...","..."],"suggestions":["...","..."],"analysis":""},
    {"key":"fengshui","strengths":["...","..."],"issues":["...","..."],"suggestions":["...","..."],"analysis":""}
  ],
  "priority_actions": ["<أهم إشي تعمله أولاً>","...","..."]
}
خلي كل عنصر بالمصفوفات جملة قصيرة عملية (أقل من 12 كلمة)، وحد أقصى 3 عناصر بكل مصفوفة. لا تتجاوزي هاد البنية.`;

    const userText = `نوع المساحة: ${roomType || "غير محدد"}.${notes ? ` ملاحظات صاحبة المكان: ${notes}.` : ""}`;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Anthropic API error:", errText);
      return res.status(502).json({ error: "فشل الاتصال بخدمة التحليل" });
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    if (!textBlock) return res.status(502).json({ error: "رد غير متوقع من الخدمة" });

    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const report = JSON.parse(cleaned);

    return res.status(200).json({ report });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "صار خلل بالتحليل" });
  }
}
