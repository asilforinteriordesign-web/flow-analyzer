import { createClient } from "@supabase/supabase-js";

// إعداد عميل Supabase باستخدام المفاتيح المحفوظة في البيئة
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType, roomType, notes, userId } = req.body || {};
    
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: "الصورة مفقودة" });
    }

    // 1. التحقق من رصيد المستخدم في Supabase (إن تم إرسال userId)
    if (userId) {
      const { data: userProfile, error: profileError } = await supabase
        .from("users") // أو اسم الجدول الخاص بك مثل profiles
        .select("credits")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Supabase profile error:", profileError);
      } else if (userProfile && userProfile.credits <= 0) {
        // إذا كان الرصيد 0، نرجع خطأ الدفع مطلوب
        return res.status(402).json({ 
          error: "لقد نفد رصيد الصور المتاح لديك. يرجى الشراء للمتابعة.",
          requiresPayment: true 
        });
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

    // 2. خصم محاولة واحدة من رصيد المستخدم بعد نجاح التحليل
    if (userId) {
      const { data: userProfile } = await supabase
        .from("users")
        .select("credits")
        .eq("id", userId)
        .single();

      if (userProfile && userProfile.credits > 0) {
        await supabase
          .from("users")
          .update({ credits: userProfile.credits - 1 })
          .eq("id", userId);
      }
    }

    return res.status(200).json({ report });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "صار خلل بالتحليل" });
  }
}
