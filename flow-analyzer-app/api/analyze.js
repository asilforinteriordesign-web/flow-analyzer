export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType, roomType, notes, userId } = req.body || {};
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: "الصورة مفقودة" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 1. فحص رصيد المستخدم من Supabase مباشرة عبر HTTP Fetch
    if (userId && supabaseUrl && supabaseKey) {
      try {
        const checkRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=credits`, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
          },
        });

        if (checkRes.ok) {
          const usersData = await checkRes.json();
          const userProfile = usersData[0];

          if (userProfile && userProfile.credits <= 0) {
            return res.status(402).json({ 
              error: "لقد نفد رصيد الصور المتاح لديك. يرجى الشراء للمتابعة.",
              requiresPayment: true 
            });
          }
        }
      } catch (sbErr) {
        console.error("Supabase check error:", sbErr);
      }
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

    // 2. خصم نقطة واحدة بعد نجاح التحليل
    if (userId && supabaseUrl && supabaseKey) {
      try {
        const fetchUserRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=credits`, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
          },
        });
        
        if (fetchUserRes.ok) {
          const usersData = await fetchUserRes.json();
          const userProfile = usersData[0];
          
          if (userProfile && userProfile.credits > 0) {
            await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
              method: "PATCH",
              headers: {
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
              },
              body: JSON.stringify({ credits: userProfile.credits - 1 }),
            });
          }
        }
      } catch (deductErr) {
        console.error("Deduct credits error:", deductErr);
      }
    }

    return res.status(200).json({ report });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "صار خلل بالتحليل" });
  }
}
